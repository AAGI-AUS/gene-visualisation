/* eslint-disable no-restricted-globals */
import { parseBED } from "@/src/utils";
import { packParsed, filterPacked } from "./analysisJob";
import type { ParseRequest, ParseResponse, PackedCache } from "./analysisJob";

const cache = new Map<string, PackedCache>();

type WorkerMessage = ParseRequest | { type: "clear" };

const isClear = (m: WorkerMessage): m is { type: "clear" } => (m as { type?: string }).type === "clear";

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  if (isClear(e.data)) {
    cache.clear();
    return;
  }
  const req = e.data;
  let packed = req.cacheKey !== undefined ? cache.get(req.cacheKey) : undefined;
  if (!packed && req.queryText !== undefined) {
    packed = packParsed(parseBED(req.queryText));
    if (req.cacheKey !== undefined) cache.set(req.cacheKey, packed);
  }
  const rows = packed ? filterPacked(packed, req.ids) : [];
  (self as unknown as Worker).postMessage({ jobId: req.jobId, rows } satisfies ParseResponse);
};
