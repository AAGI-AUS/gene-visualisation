import type { Result } from "@/src/store/useAppStore";

export interface SortSnapshot {
  order: string[];
  result: Result;
  commonIds: Set<number>;
  palette: Record<string, string>;
}

const MAX_ENTRIES = 64;

// lru: least recently used
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

const snapshotCache = new Map<string, SortSnapshot>();
const commonIdsCache = new Map<string, Set<number>>();

// Order-independent in the query set: autoSort re-derives ordering itself.
export const sortCacheKey = (
  baseKey: string,
  selectedChr: string,
  groupThreshold: number,
  queryKeys: string[]
) => [baseKey, selectedChr, groupThreshold, [...queryKeys].sort().join("")].join(" ");

export const getSortSnapshot = (key: string) => lruGet(snapshotCache, key);
export const setSortSnapshot = (key: string, snapshot: SortSnapshot) => lruSet(snapshotCache, key, snapshot);

export const getCommonIds = (key: string) => lruGet(commonIdsCache, key);
export const setCommonIds = (key: string, ids: Set<number>) => lruSet(commonIdsCache, key, ids);

export const clearSortCache = () => {
  snapshotCache.clear();
  commonIdsCache.clear();
};
