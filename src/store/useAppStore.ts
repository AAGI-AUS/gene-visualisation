import { create } from "zustand";
import { BedFile, FileHandler, ResultRow } from "@/types";
import { getChromosomes, parseBED, queryGene, fileToText } from "@/src/utils";

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
  selectedChr: "",
  groupThreshold: 0.01,
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
    const { base, queryFiles, selectedChr, groupThreshold } = get();
    if (!base || !selectedChr) return;

    // filter before analysis
    const filteredBase = base.rows.filter((r) => r.chromosome === selectedChr);
    const ids = new Set(filteredBase.map((r) => r.id));
    const queries = await Promise.all(
      queryFiles.map(async (f) => parseBED(await fileToText(f)).filter((r) => ids.has(r.id)))
    );
    // const queries = await Promise.all(
    //   queryFiles.map(
    //     async (f) =>
    //       new Map(
    //         parseBED(await fileToText(f))
    //           .filter((r) => ids.has(r.id))
    //           .map((r) => [r.id, r])
    //       )
    //   )
    // );

    if (!queries.length) return;
    try {
      const result = queries.map((query, i) =>
        queryGene(i === 0 ? filteredBase : queries[i - 1], new Map(query.map((r) => [r.id, r])), groupThreshold)
      );
      set({
        result: result.map((res, i) => ({ name: queryFiles[i].name, rows: res })),
        error: null,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
