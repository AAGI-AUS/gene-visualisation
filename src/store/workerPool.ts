import { parseFiltered } from "./analysisJob";
import { createAnalysisWorker } from "./createAnalysisWorker";
import type { ParseRequest, ParseResponse } from "./analysisJob";

export const defaultWorkerCount = Math.max(
  1,
  Math.min(4, (typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 4) : 4) - 1)
);

let targetSize = defaultWorkerCount;

type QueuedJob = {
  full: ParseRequest;
  resolve: (res: ParseResponse) => void;
};

type Slot = {
  worker: Worker;
  busy: boolean;
  queue: QueuedJob[];
};

let slots: Slot[] | null = null;
let unavailable = false;
let nextJobId = 0;
let nextSlotForNew = 0;
const fingerprintToSlot = new Map<string, number>();
const knownCached = new Set<string>();
const pending = new Map<number, (res: ParseResponse) => void>();

const tearDown = () => {
  slots?.forEach((s) => s.worker.terminate());
  slots = null;
  pending.clear();
  fingerprintToSlot.clear();
  knownCached.clear();
  nextSlotForNew = 0;
};

const dispatchOn = (slot: Slot) => {
  const job = slot.queue.shift();
  if (!job) {
    slot.busy = false;
    return;
  }
  slot.busy = true;
  pending.set(job.full.jobId, (res) => {
    job.resolve(res);
    dispatchOn(slot);
  });
  slot.worker.postMessage(job.full);
};

const slotIndexFor = (key: string | undefined): number => {
  if (key === undefined) {
    const i = nextSlotForNew;
    nextSlotForNew = (nextSlotForNew + 1) % targetSize;
    return i;
  }
  let idx = fingerprintToSlot.get(key);
  if (idx === undefined) {
    idx = nextSlotForNew;
    nextSlotForNew = (nextSlotForNew + 1) % targetSize;
    fingerprintToSlot.set(key, idx);
  }
  return idx;
};

const tryInitPool = (): Slot[] | null => {
  if (slots) return slots;
  if (unavailable) return null;
  if (typeof Worker === "undefined") {
    unavailable = true;
    return null;
  }

  try {
    slots = Array.from({ length: targetSize }, (): Slot => {
      const w = createAnalysisWorker();
      const slot: Slot = { worker: w, busy: false, queue: [] };
      w.onmessage = (e: MessageEvent<ParseResponse>) => {
        const resolve = pending.get(e.data.jobId);
        if (!resolve) return;
        pending.delete(e.data.jobId);
        resolve(e.data);
      };
      w.onerror = () => {
        unavailable = true;
        tearDown();
      };
      return slot;
    });
    return slots;
  } catch {
    unavailable = true;
    return null;
  }
};

const runSerial = (req: ParseRequest): ParseResponse => parseFiltered(req);

export const parseQueryInWorker = (req: Omit<ParseRequest, "jobId">): Promise<ParseResponse> => {
  const jobId = nextJobId++;
  const full: ParseRequest = { ...req, jobId };
  const pool = tryInitPool();
  if (!pool) return Promise.resolve(runSerial(full));

  return new Promise<ParseResponse>((resolve) => {
    const slot = pool[slotIndexFor(req.cacheKey)];
    const wrapped = (res: ParseResponse) => {
      if (req.cacheKey !== undefined) knownCached.add(req.cacheKey);
      resolve(res);
    };
    slot.queue.push({ full, resolve: wrapped });
    if (!slot.busy) dispatchOn(slot);
  });
};

export const isCached = (key: string): boolean => knownCached.has(key);

export const setPoolSize = (n: number) => {
  const size = Math.max(1, Math.floor(n));
  if (size === targetSize) return;
  targetSize = size;
  if (slots) tearDown();
};

export const clearWorkerCaches = () => {
  knownCached.clear();
  if (!slots) return;
  for (const slot of slots) slot.worker.postMessage({ type: "clear" });
};

export const isWorkerPoolActive = () => slots !== null && !unavailable;
