import { OTHERS_CYCLE, OthersMode } from "@/src/constants";
import { BaseRow, QueryRow, TooltipInfo } from "@/types";
import { create } from "zustand";

interface VisualizationState {
  gapBp: number;
  hiddenThreshold: number;
  othersMode: OthersMode;
  svgW: number;
  hoverChunk: string | null;
  tooltip: TooltipInfo | null;
  baseRows: BaseRow[];
}

interface VisualizationActions {
  setBaseRows: (i: number, baseRow: BaseRow, queryRow: QueryRow) => void;
  setGapBp: (v: number) => void;
  setHiddenThreshold: (v: number) => void;
  setOthersMode: (v: OthersMode | ((prev: OthersMode) => OthersMode)) => void;
  setSvgW: (w: number) => void;
  setHoverChunk: (id: string | null) => void;
  setTooltip: (t: TooltipInfo | null) => void;
  clearHover: () => void;
}

export const useVisualizationStore = create<VisualizationState & VisualizationActions>((set) => ({
  gapBp: 100000,
  hiddenThreshold: 20,
  othersMode: OTHERS_CYCLE[0],
  svgW: 900,
  hoverChunk: null,
  tooltip: null,
  baseRows: [],

  setBaseRows: (i, baseRow, queryRow) =>
    set((state) => {
      const row: BaseRow = {
        label: "",
        bars: queryRow.slots.filter((s) => s.kind === "chr"),
        y: baseRow.y,
      };
      return i !== 0 ? { baseRows: [...state.baseRows, row] } : { baseRows: [row] };
    }),
  setGapBp: (v) => set({ gapBp: Math.max(1000, v) }),
  setHiddenThreshold: (v) => set({ hiddenThreshold: Math.max(0, v) }),
  setOthersMode: (v) => set((s) => ({ othersMode: typeof v === "function" ? v(s.othersMode) : v })),
  setSvgW: (w) => set({ svgW: Math.max(w, 400) }),
  setHoverChunk: (id) => set({ hoverChunk: id }),
  setTooltip: (t) => set({ tooltip: t }),
  clearHover: () => set({ hoverChunk: null, tooltip: null }),
}));
