import type { Result } from "@/src/store/useAppStore";

// Everything needed to recreate the synteny SVG for one autoSort run, so a
// repeat trigger (same inputs) skips parsing, greedy sorting, and queryGene.
export interface AutoSortSnapshot {
  order: string[];
  result: Result;
  commonIds: Set<number>;
  palette: Record<string, string>;
}

const MAX_ENTRIES = 64;

// LRU get: touch on hit so the most-recently-used entry survives eviction.
const lruGet = <T>(cache: Map<string, T>, key: string) => {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
};

const lruSet = <T>(cache: Map<string, T>, key: string, value: T) => {
  cache.set(key, value);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
};

const snapshotCache = new Map<string, AutoSortSnapshot>();
const commonIdsCache = new Map<string, Set<number>>();

// Order-independent in the query set: autoSort re-derives ordering itself.
export const autoSortCacheKey = (
  baseFp: string,
  selectedChr: string,
  groupThreshold: number,
  queryFps: string[]
) => [baseFp, selectedChr, groupThreshold, [...queryFps].sort().join("")].join(" ");

export const getAutoSortSnapshot = (key: string) => lruGet(snapshotCache, key);
export const setAutoSortSnapshot = (key: string, snapshot: AutoSortSnapshot) =>
  lruSet(snapshotCache, key, snapshot);

// Core gene ids for one chromosome, cached separately from full snapshots: the
// summary tab needs only this set and never the greedy ordering or palette.
export const getCommonIds = (key: string) => lruGet(commonIdsCache, key);
export const setCommonIds = (key: string, ids: Set<number>) => lruSet(commonIdsCache, key, ids);

export const clearAutoSortCache = () => {
  snapshotCache.clear();
  commonIdsCache.clear();
};
