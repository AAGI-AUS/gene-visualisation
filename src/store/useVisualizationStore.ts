import { TooltipInfo } from "@/types";
import { create } from "zustand";

interface VisualizationState {
  gapBp: number;
  othersMode: boolean;
  svgW: number;
  hoverChunk: string | null;
  tooltip: TooltipInfo | null;
}

interface VisualizationActions {
  setGapBp: (v: number) => void;
  setOthersMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSvgW: (w: number) => void;
  setHoverChunk: (id: string | null) => void;
  setTooltip: (t: TooltipInfo | null) => void;
  clearHover: () => void;
}

export const useVisualizationStore = create<VisualizationState & VisualizationActions>((set) => ({
  gapBp: 50000,
  othersMode: false,
  svgW: 900,
  hoverChunk: null,
  tooltip: null,

  setGapBp: (v) => set({ gapBp: Math.max(1000, v) }),
  setOthersMode: (v) => set((s) => ({ othersMode: typeof v === "function" ? v(s.othersMode) : v })),
  setSvgW: (w) => set({ svgW: Math.max(w, 400) }),
  setHoverChunk: (id) => set({ hoverChunk: id }),
  setTooltip: (t) => set({ tooltip: t }),
  clearHover: () => set({ hoverChunk: null, tooltip: null }),
}));
