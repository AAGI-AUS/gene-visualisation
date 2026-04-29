import { create } from "zustand";
import { BedFile, FileHandler, ResultRow } from "@/types";
import { getChromosomes, parseBED, queryGene, fileToText } from "@/src/utils";

interface AppState {
  queryFiles: File[];
  base: BedFile | null;
  chromosomes: string[];
  selectedChr: string | null;
  groupThreshold: number;
  offLocThreshold: number;
  result: ResultRow[][];
  error: string | null;
}

interface AppActions {
  setBase: FileHandler;
  setQueryFiles: FileHandler;
  setGroupThreshold: (value: number) => void;
  setAppState: (state: Partial<AppState>) => void;
  clearBase: () => void;
  clearQuery: (i: number) => void;
  runAnalysis: () => void;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>((set, get) => ({
  // ── state ──────────────────────────────────────────────────────────────
  base: null,
  queryFiles: [],
  chromosomes: [],
  selectedChr: null,
  groupThreshold: 0.01,
  offLocThreshold: 0.11,
  result: [],
  error: null,

  // ── actions ────────────────────────────────────────────────────────────
  setBase: async (file) => {
    if (!file) return set({ base: null });

    const text = await fileToText(file);
    const rows = parseBED(text);
    const chromosomes = getChromosomes(rows);
    set({ base: { name: file.name, rows }, chromosomes, selectedChr: chromosomes[0] });
  },
  setQueryFiles: (file) => {
    if (!file) return;
    set((state) => ({
      queryFiles: [...state.queryFiles, file],
    }));
  },
  setGroupThreshold: (groupThreshold) => set({ groupThreshold }),
  setAppState: (state) => set(state),
  clearBase: () => set({ base: null, result: [], error: null }),
  clearQuery: (i) => set((state) => ({ queryFiles: state.queryFiles.filter((_, j) => i !== j), error: null })),

  runAnalysis: async () => {
    const { base, queryFiles, selectedChr, groupThreshold, offLocThreshold } = get();
    if (!base || !selectedChr) return;

    // filter before analysis
    const filteredBase = base.rows.filter((r) => r.chromosome === selectedChr);
    const ids = new Set(filteredBase.map((r) => r.id));
    const queries = await Promise.all(
      queryFiles.map(
        async (f) =>
          new Map(
            parseBED(await fileToText(f))
              .filter((r) => ids.has(r.id))
              .map((r) => [r.id, r])
          )
      )
    );

    if (!queries.length) return;
    try {
      const result = queries.map((query) => queryGene(filteredBase, query, groupThreshold, offLocThreshold));
      set({ result, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
