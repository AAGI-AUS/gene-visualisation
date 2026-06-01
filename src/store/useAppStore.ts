import { create } from "zustand";
import type { BedFile, BedRow, CentromereData, FilesHandler, ResultRow } from "@/types";
import { getChromosomes, parseBED, parseCentromere, queryGene, fileToText } from "@/src/utils";
import { buildPalette, computeCommonIds } from "@/src/store/utils";
import {
  clearWorkerCaches,
  defaultWorkerCount,
  isCached,
  parseQueryInWorker,
  setPoolSize,
} from "@/src/store/workerPool";

export type Result = {
  name: string;
  rows: ResultRow[];
}[];

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
        const cacheKey = fingerprintOf(file);
        const queryText = isCached(cacheKey) ? undefined : await fileToText(file);
        const res = await parseQueryInWorker({ ids, queryText, cacheKey });
        out[i] = transform(i, res.rows);
      }
    })
  );
  return out;
};

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
    const rows = parseBED(text);
    const chromosomes = getChromosomes(rows).sort();
    set({ base: { name: file.name, rows }, baseFile: file, chromosomes, selectedChr: chromosomes[0] });
  },
  setQueryFiles: (file) => {
    if (!file) return;
    set((state) => ({
      queryFiles: [...state.queryFiles, ...file],
    }));
  },
  setGroupThreshold: (groupThreshold) => set({ groupThreshold }),
  setAppState: (state) => set(state),
  clearBase: () => set({ base: null, baseFile: null, result: [], commonIds: new Set(), error: null }),
  clearQuery: (i) =>
    set((state) => {
      clearWorkerCaches();
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
    const rows = parseBED(text);
    const chromosomes = getChromosomes(rows).sort();
    const nextQueries = [...queryFiles];
    if (baseFile) {
      nextQueries[i] = baseFile;
    } else {
      nextQueries.splice(i, 1);
    }
    clearWorkerCaches();
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
      const { base, queryFiles, selectedChr, groupThreshold, workerCount } = get();
      if (!base || !selectedChr || !queryFiles.length) return;
      setPoolSize(workerCount);

      const filteredBase = base.rows.filter((r) => r.chromosome === selectedChr);
      const ids = new Set(filteredBase.map((r) => r.id));

      try {
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

        set({
          queryFiles: sortedFiles,
          result: sortedResult,
          commonIds: computeCommonIds(sortedResult),
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
}));
