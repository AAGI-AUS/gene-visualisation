import { create } from "zustand";
import { BedFile, FilesHandler, ResultRow } from "@/types";
import { getChromosomes, parseBED, queryGene, fileToText } from "@/src/utils";
import { buildPalette } from "@/src/store/utils";

export type Result = {
  name: string;
  rows: ResultRow[];
}[];

interface AppState {
  queryFiles: File[];
  base: BedFile | null;
  chromosomes: string[];
  selectedChr: string;
  groupThreshold: number;
  result: Result;
  error: string | null;
  running: boolean;
  palette: Record<string, string>;
}

interface AppActions {
  setBase: FilesHandler;
  setQueryFiles: FilesHandler;
  setGroupThreshold: (value: number) => void;
  setAppState: (state: Partial<AppState>) => void;
  clearBase: () => void;
  clearQuery: (i: number) => void;
  reorderQuery: (from: number, to: number) => void;
  runAnalysis: () => void;
  autoSort: () => void;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>((set, get) => ({
  // ── state ──────────────────────────────────────────────────────────────
  base: null,
  queryFiles: [],
  chromosomes: [],
  selectedChr: "",
  groupThreshold: 0.01,
  result: [],
  error: null,
  running: false,
  palette: {},

  // ── actions ────────────────────────────────────────────────────────────
  setBase: async (files) => {
    const file = files?.[0];
    if (!file) return set({ base: null });

    const text = await fileToText(file);
    const rows = parseBED(text);
    const chromosomes = getChromosomes(rows);
    set({ base: { name: file.name, rows }, chromosomes, selectedChr: chromosomes[0] });
  },
  setQueryFiles: (file) => {
    if (!file) return;
    set((state) => ({
      queryFiles: [...state.queryFiles, ...file],
    }));
  },
  setGroupThreshold: (groupThreshold) => set({ groupThreshold }),
  setAppState: (state) => set(state),
  clearBase: () => set({ base: null, result: [], error: null }),
  clearQuery: (i) => set((state) => ({ queryFiles: state.queryFiles.filter((_, j) => i !== j), error: null })),
  reorderQuery: (from, to) =>
    set((state) => {
      if (from === to) return state;
      const next = [...state.queryFiles];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { queryFiles: next, error: null };
    }),

  runAnalysis: async () => {
    set({ running: true });
    try {
      const { base, queryFiles, selectedChr, groupThreshold } = get();
      if (!base || !selectedChr) return;

      const filteredBase = base.rows.filter((r) => r.chromosome === selectedChr);
      const ids = new Set(filteredBase.map((r) => r.id));
      const queries = await Promise.all(
        queryFiles.map(async (f) => parseBED(await fileToText(f)).filter((r) => ids.has(r.id)))
      );
      if (!queries.length) return;

      try {
        const allChroms: string[] = [];
        const result = queries.map((query, i) => {
          const { rows, chromosomes } = queryGene(
            i === 0 ? filteredBase : queries[i - 1],
            new Map(query.map((r) => [r.id, r])),
            groupThreshold
          );
          allChroms.push(...chromosomes);
          return { name: queryFiles[i].name, rows };
        });

        set({ result, palette: buildPalette(selectedChr, allChroms), error: null });
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
      const { base, queryFiles, selectedChr, groupThreshold } = get();
      if (!base || !selectedChr || !queryFiles.length) return;

      const filteredBase = base.rows.filter((r) => r.chromosome === selectedChr);
      const ids = new Set(filteredBase.map((r) => r.id));
      const parsed = await Promise.all(
        queryFiles.map(async (f) => ({
          file: f,
          rows: parseBED(await fileToText(f)).filter((r) => ids.has(r.id)),
        }))
      );

      try {
        const remaining = [...parsed];
        const sortedResult: Result = [];
        const sortedFiles: File[] = [];
        const allChroms: string[] = [];
        let prev = filteredBase;

        while (remaining.length) {
          let bestIdx = 0;
          let bestPct = -1;
          let bestRows: ResultRow[] = [];
          let bestChroms: string[] = [];

          for (let i = 0; i < remaining.length; i++) {
            const { rows, chromosomes } = queryGene(
              prev,
              new Map(remaining[i].rows.map((r) => [r.id, r])),
              groupThreshold
            );
            const pct = rows.length ? rows.filter((r) => r.mainEvent === "synteny").length / rows.length : 0;
            if (pct > bestPct) {
              bestPct = pct;
              bestIdx = i;
              bestRows = rows;
              bestChroms = chromosomes;
            }
          }

          const winner = remaining[bestIdx];
          sortedResult.push({ name: winner.file.name, rows: bestRows });
          sortedFiles.push(winner.file);
          allChroms.push(...bestChroms);
          prev = winner.rows;
          remaining.splice(bestIdx, 1);
        }

        set({
          queryFiles: sortedFiles,
          result: sortedResult,
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
