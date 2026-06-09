import { clamp, parseBED } from "@/src/utils";
import { packParsed } from "./analysisJob";
import { createAnalysisWorker } from "./createAnalysisWorker";
import type { PackRequest, PackResponse, PackedCache } from "./analysisJob";

export const MAX_WORKERS = 16;

const hardwareConcurrency = (typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 4) : 4) - 1;
export const defaultWorkerCount = clamp(hardwareConcurrency, 1, 4);

let targetSize = defaultWorkerCount;
let slots: Worker[] | null = null;
let unavailable = false;
let nextJobId = 0;
let nextWorker = 0;

const packedByKey = new Map<string, PackedCache>();
const inFlight = new Map<string, Promise<PackedCache>>();
const pending = new Map<number, { resolve: (p: PackedCache) => void; reject: (e: unknown) => void }>();

const tearDown = (reason: unknown) => {
  slots?.forEach((w) => w.terminate());
  slots = null;
  pending.forEach((p) => p.reject(reason));
  pending.clear();
  inFlight.clear();
  nextWorker = 0;
};

const tryInitPool = (): Worker[] | null => {
  if (slots) return slots;
  if (unavailable) return null;
  if (typeof Worker === "undefined") {
    unavailable = true;
    return null;
  }

  try {
    slots = Array.from({ length: targetSize }, () => {
      const w = createAnalysisWorker();
      w.onmessage = (e: MessageEvent<PackResponse>) => {
        const job = pending.get(e.data.jobId);
        if (!job) return;
        pending.delete(e.data.jobId);
        job.resolve(e.data.packed);
      };

      w.onerror = () => {
        unavailable = true;
        tearDown(new Error("analysis worker crashed"));
      };
      return w;
    });

    return slots;
  } catch {
    unavailable = true;
    return null;
  }
};

const dispatchPack = (pool: Worker[], text: string): Promise<PackedCache> => {
  const jobId = nextJobId++;
  const worker = pool[nextWorker];
  nextWorker = (nextWorker + 1) % pool.length;

  return new Promise<PackedCache>((resolve, reject) => {
    pending.set(jobId, { resolve, reject });
    worker.postMessage({ jobId, text } satisfies PackRequest);
  });
};

export const getCachedPacked = (key: string) => packedByKey.get(key);
export const isCached = (key: string) => packedByKey.has(key);

export const packFile = (key: string, text: string): Promise<PackedCache> => {
  const cached = packedByKey.get(key);
  if (cached) return Promise.resolve(cached);

  const flying = inFlight.get(key);
  if (flying) return flying;

  const pool = tryInitPool();
  const parsing = pool ? dispatchPack(pool, text) : Promise.resolve(packParsed(parseBED(text)));
  const tracked = parsing.then(
    (packed) => {
      packedByKey.set(key, packed);
      inFlight.delete(key);
      return packed;
    },
    (err) => {
      inFlight.delete(key);
      throw err;
    }
  );

  inFlight.set(key, tracked);
  return tracked;
};

export const setPoolSize = (n: number) => {
  const size = clamp(Math.floor(n), 1, MAX_WORKERS);
  if (size === targetSize) return;
  targetSize = size;
  if (slots) tearDown(new Error("worker pool resized"));
};

export const clearWorkerCaches = () => {
  packedByKey.clear();
  inFlight.clear();
};
