import { create } from "zustand";
import { BedFile, ResultRow } from "../../types";
import { queryGene } from "../utils";

interface AppState {
  baseFile: BedFile | null;
  queryFile: BedFile | null;
  groupThreshold: number;
  offLocThreshold: number;
  result: ResultRow[] | null;
  error: string | null;
}

interface AppActions {
  setBaseFile: (file: BedFile) => void;
  setQueryFile: (file: BedFile) => void;
  setGroupThreshold: (value: number) => void;
  setAppState: (state: Partial<AppState>) => void;
  clearBase: () => void;
  clearQuery: () => void;
  runAnalysis: () => void;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>((set, get) => ({
  // ── state ──────────────────────────────────────────────────────────────
  baseFile: null,
  queryFile: null,
  groupThreshold: 0.01,
  offLocThreshold: 0.05,
  result: null,
  error: null,

  // ── actions ────────────────────────────────────────────────────────────
  setBaseFile: (baseFile) => set({ baseFile, result: null, error: null }),
  setQueryFile: (queryFile) => set({ queryFile, result: null, error: null }),
  setGroupThreshold: (groupThreshold) => set({ groupThreshold }),
  setAppState: (state) => set(state),
  clearBase: () => set({ baseFile: null, result: null, error: null }),
  clearQuery: () => set({ queryFile: null, result: null, error: null }),

  runAnalysis: () => {
    const { baseFile, queryFile, groupThreshold, offLocThreshold } = get();
    if (!baseFile || !queryFile) return;
    try {
      const result = queryGene(baseFile.rows, queryFile.rows, groupThreshold, offLocThreshold);
      set({ result, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
