import { create } from "zustand";
import type { BedFile, BedRow, CentromereData, FilesHandler, ResultRow } from "@/types";
import { clamp, getChromosomes, parseBED, parseCentromere, queryGene, fileToText } from "@/src/utils";
import { buildPalette, computeCommonIds } from "@/src/store/utils";
import type { AutoSortSnapshot } from "@/src/store/autoSortCache";
import {
  autoSortCacheKey,
  clearAutoSortCache,
  getAutoSortSnapshot,
  setAutoSortSnapshot,
  getCommonIds,
  setCommonIds,
} from "@/src/store/autoSortCache";
import { chunkRows } from "@/src/components/visualizationTab/utils";
import { filterPacked } from "@/src/store/analysisJob";
import {
  clearWorkerCaches,
  defaultWorkerCount,
  getCachedPacked,
  packFile,
  setPoolSize,
} from "@/src/store/workerPool";

export type Result = {
  name: string;
  rows: ResultRow[];
}[];

/** One grayscale segment of a baseline chromosome bar in the summary figure. */
export interface SummaryChunk {
  bp1: number;
  bp2: number;
  coverage: number;
}

export interface SummaryBar {
  chr: string;
  chunks: SummaryChunk[];
}

interface AppState {
  queryFiles: File[];
  base: BedFile | null;
  baseFile: File | null;
  chromosomes: string[];
  selectedChr: string;
  groupThreshold: number;
  result: Result;
  commonIds: Set<number>;
  error: string | null;
  running: boolean;
  batching: boolean;
  palette: Record<string, string>;
  centromereName: string | null;
  centromere: CentromereData;
  workerCount: number;
}

interface AppActions {
  setBase: (files: FileList | null | undefined) => Promise<void>;
  setQueryFiles: FilesHandler;
  setGroupThreshold: (value: number) => void;
  setAppState: (state: Partial<AppState>) => void;
  clearBase: () => void;
  clearQuery: (i: number) => void;
  reorderQuery: (from: number, to: number) => void;
  swapBaseWithQuery: (i: number) => Promise<void>;
  setCentromere: (files: FileList | null | undefined) => Promise<void>;
  clearCentromere: () => void;
  runAnalysis: () => Promise<void>;
  autoSort: () => Promise<void>;
  buildSummaryBar: (chr: string, gapBp: number, hiddenThreshold: number) => Promise<SummaryBar>;
}

export type AppStore = AppState & AppActions;

const fingerprintOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
const parseFilesInParallel = async <T>(
  files: File[],
  ids: Set<number>,
  workerCount: number,
  transform: (index: number, rows: BedRow[]) => T
): Promise<T[]> => {
  const out: T[] = new Array(files.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(workerCount, files.length) }, async () => {
      while (cursor < files.length) {
        const i = cursor++;
        const file = files[i];
        const key = fingerprintOf(file);
        const packed = getCachedPacked(key) ?? (await packFile(key, await fileToText(file), file.name));
        out[i] = transform(i, filterPacked(packed, ids));
      }
    })
  );

  return out;
};

// Cache-aware autoSort for one chromosome. Pure: never mutates store state, so
// the summary tab can run it across every chromosome without disturbing the
// active visualization. Reuses the snapshot cache populated by the autoSort action.
const computeAutoSortSnapshot = async (
  base: BedFile,
  baseFile: File | null,
  queryFiles: File[],
  chr: string,
  groupThreshold: number,
  workerCount: number
): Promise<AutoSortSnapshot> => {
  const cacheKey = baseFile
    ? autoSortCacheKey(fingerprintOf(baseFile), chr, groupThreshold, queryFiles.map(fingerprintOf))
    : null;
  if (cacheKey) {
    const cached = getAutoSortSnapshot(cacheKey);
    if (cached) return cached;
  }

  setPoolSize(workerCount);
  const filteredBase = base.rows.filter((r) => r.chromosome === chr);
  const ids = new Set(filteredBase.map((r) => r.id));

  const remaining = await parseFilesInParallel(queryFiles, ids, workerCount, (i, rows) => ({
    file: queryFiles[i],
    rows,
    map: new Map(rows.map((r) => [r.id, r])),
  }));

  const sortedResult: Result = [];
  const sortedFiles: File[] = [];
  const allChroms: string[] = [];
  let prev = filteredBase;

  while (remaining.length) {
    let bestIdx = 0;
    let bestPct = -1;
    for (let i = 0; i < remaining.length; i++) {
      const map = remaining[i].map;
      let joined = 0;
      let synteny = 0;
      for (const b of prev) {
        const q = map.get(b.id);
        if (!q) continue;
        joined++;
        if (b.chromosome === q.chromosome && b.sign === q.sign) synteny++;
      }
      const pct = joined ? synteny / joined : 0;
      if (pct > bestPct) {
        bestPct = pct;
        bestIdx = i;
      }
    }

    const winner = remaining[bestIdx];
    const { rows, chromosomes } = queryGene(prev, winner.map, groupThreshold);
    sortedResult.push({ name: winner.file.name, rows });
    sortedFiles.push(winner.file);
    allChroms.push(...chromosomes);
    prev = winner.rows;
    remaining.splice(bestIdx, 1);
  }

  const snapshot: AutoSortSnapshot = {
    order: sortedFiles.map(fingerprintOf),
    result: sortedResult,
    commonIds: computeCommonIds(sortedResult),
    palette: buildPalette(chr, allChroms),
  };
  if (cacheKey) setAutoSortSnapshot(cacheKey, snapshot);
  return snapshot;
};

// Core (common) gene ids for one chromosome, computed without the greedy sort.
// commonIds is invariant to query order, so a plain base->query join per file
// yields the same set far more cheaply than a full autoSort. Reuses an autoSort
// snapshot when one is already cached for these inputs.
const commonIdsForChr = async (
  base: BedFile,
  baseFile: File | null,
  queryFiles: File[],
  chr: string,
  groupThreshold: number,
  workerCount: number
): Promise<Set<number>> => {
  const cacheKey = baseFile
    ? autoSortCacheKey(fingerprintOf(baseFile), chr, groupThreshold, queryFiles.map(fingerprintOf))
    : null;
  if (cacheKey) {
    const snapshot = getAutoSortSnapshot(cacheKey);
    if (snapshot) return snapshot.commonIds;
    const cached = getCommonIds(cacheKey);
    if (cached) return cached;
  }

  setPoolSize(workerCount);
  const filteredBase = base.rows.filter((r) => r.chromosome === chr);
  const ids = new Set(filteredBase.map((r) => r.id));

  const maps = await parseFilesInParallel(
    queryFiles,
    ids,
    workerCount,
    (_, rows) => new Map(rows.map((r) => [r.id, r]))
  );
  const pairs = maps.map((map) => queryGene(filteredBase, map, groupThreshold));
  const commonIds = computeCommonIds(pairs);

  if (cacheKey) setCommonIds(cacheKey, commonIds);
  return commonIds;
};

// Baseline gene mapped onto itself, so the synteny chunker treats it as pure synteny.
const toSelfResultRow = (r: BedRow): ResultRow => ({
  id: r.id,
  chromosomeBase: r.chromosome,
  p1Base: r.p1,
  p2Base: r.p2,
  chromosomeQuery: r.chromosome,
  p1Query: r.p1,
  p2Query: r.p2,
  sign: r.sign,
  isInvert: false,
  isTranslocation: false,
  mainEvent: "synteny",
  groupedQuery: r.chromosome,
});

export const useAppStore = create<AppStore>((set, get) => ({
  // ── state ──────────────────────────────────────────────────────────────
  base: null,
  baseFile: null,
  queryFiles: [],
  chromosomes: [],
  selectedChr: "",
  groupThreshold: 0.01,
  result: [],
  commonIds: new Set(),
  error: null,
  running: false,
  batching: false,
  palette: {},
  centromereName: null,
  centromere: new Map(),
  workerCount: defaultWorkerCount,

  // ── actions ────────────────────────────────────────────────────────────
  setBase: async (files) => {
    const file = files?.[0];
    if (!file) return set({ base: null, baseFile: null });

    const text = await fileToText(file);
    const rows = parseBED(text, file.name);
    const chromosomes = getChromosomes(rows).sort();
    clearAutoSortCache();
    set({ base: { name: file.name, rows }, baseFile: file, chromosomes, selectedChr: chromosomes[0] });
  },
  setQueryFiles: (file) => {
    if (!file) return;
    clearAutoSortCache();
    set((state) => ({
      queryFiles: [...state.queryFiles, ...file],
    }));
  },
  setGroupThreshold: (groupThreshold) => set({ groupThreshold }),
  setAppState: (state) => set(state),
  clearBase: () => {
    clearAutoSortCache();
    set({ base: null, baseFile: null, result: [], commonIds: new Set(), error: null });
  },
  clearQuery: (i) =>
    set((state) => {
      clearWorkerCaches();
      clearAutoSortCache();
      return { queryFiles: state.queryFiles.filter((_, j) => i !== j), error: null };
    }),
  reorderQuery: (from, to) =>
    set((state) => {
      if (from === to) return state;
      const next = [...state.queryFiles];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { queryFiles: next, error: null };
    }),
  setCentromere: async (files) => {
    const file = files?.[0];
    if (!file) return set({ centromereName: null, centromere: new Map() });
    const text = await fileToText(file);
    set({ centromereName: file.name, centromere: parseCentromere(text) });
  },
  clearCentromere: () => set({ centromereName: null, centromere: new Map() }),
  swapBaseWithQuery: async (i) => {
    const { baseFile, queryFiles } = get();
    const incoming = queryFiles[i];
    if (!incoming) return;

    const text = await fileToText(incoming);
    const rows = parseBED(text, incoming.name);
    const chromosomes = getChromosomes(rows).sort();
    const nextQueries = [...queryFiles];
    if (baseFile) {
      nextQueries[i] = baseFile;
    } else {
      nextQueries.splice(i, 1);
    }
    clearWorkerCaches();
    clearAutoSortCache();
    set({
      base: { name: incoming.name, rows },
      baseFile: incoming,
      queryFiles: nextQueries,
      chromosomes,
      selectedChr: chromosomes[0],
      result: [],
      commonIds: new Set(),
      error: null,
    });
  },

  runAnalysis: async () => {
    set({ running: true });
    try {
      const { base, queryFiles, selectedChr, groupThreshold, workerCount } = get();
      if (!base || !selectedChr) return;
      setPoolSize(workerCount);

      const filteredBase = base.rows.filter((r) => r.chromosome === selectedChr);
      const ids = new Set(filteredBase.map((r) => r.id));
      if (!queryFiles.length) return;

      try {
        const parsed: (BedRow[] | undefined)[] = await parseFilesInParallel(
          queryFiles,
          ids,
          workerCount,
          (_, rows) => rows
        );

        const allChroms: string[] = [];
        const result: Result = new Array(parsed.length);
        for (let i = 0; i < parsed.length; i++) {
          const queryRows = parsed[i]!;
          const baseRows = i === 0 ? filteredBase : parsed[i - 1]!;
          const queryMap = new Map(queryRows.map((r) => [r.id, r]));
          const { rows, chromosomes } = queryGene(baseRows, queryMap, groupThreshold);
          allChroms.push(...chromosomes);
          result[i] = { name: queryFiles[i].name, rows };
          if (i > 0) parsed[i - 1] = undefined;
        }
        parsed[parsed.length - 1] = undefined;

        set({
          result,
          commonIds: computeCommonIds(result),
          palette: buildPalette(selectedChr, allChroms),
          error: null,
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      set({ running: false });
    }
  },

  autoSort: async () => {
    set({ running: true });
    try {
      const { base, baseFile, queryFiles, selectedChr, groupThreshold, workerCount } = get();
      if (!base || !selectedChr || !queryFiles.length) return;

      try {
        const snapshot = await computeAutoSortSnapshot(
          base,
          baseFile,
          queryFiles,
          selectedChr,
          groupThreshold,
          workerCount
        );

        const byFp = new Map(queryFiles.map((f) => [fingerprintOf(f), f]));
        const sortedFiles = snapshot.order.map((fp) => byFp.get(fp));
        set({
          queryFiles: sortedFiles.every((f): f is File => f !== undefined) ? sortedFiles : queryFiles,
          result: snapshot.result,
          commonIds: snapshot.commonIds,
          palette: snapshot.palette,
          error: null,
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      set({ running: false });
    }
  },

  buildSummaryBar: async (chr, gapBp, hiddenThreshold) => {
    const { base, baseFile, queryFiles, groupThreshold, workerCount } = get();
    if (!base || !queryFiles.length) return { chr, chunks: [] };

    let surviving: Set<number>;
    try {
      surviving = await commonIdsForChr(base, baseFile, queryFiles, chr, groupThreshold, workerCount);
    } catch {
      surviving = new Set();
    }

    const selfRows = base.rows
      .filter((r) => r.chromosome === chr && surviving.has(r.id))
      .sort((a, b) => a.p1 - b.p1)
      .map(toSelfResultRow);

    const chunks = chunkRows(selfRows, gapBp, "base")
      .filter((c) => c.eventCounts.total > hiddenThreshold)
      .map((c) => {
        const span = c.bp2Base - c.bp1Base;
        const coverage = span > 0 ? clamp(c.bpGeneBase / span, 0, 1) : c.bpGeneBase > 0 ? 1 : 0;
        return { bp1: c.bp1Base, bp2: c.bp2Base, coverage };
      });

    return { chr, chunks };
  },
}));
