import { OTHERS_CYCLE, OthersMode } from "@/src/constants";
import { TooltipInfo } from "@/types";
import { create } from "zustand";

interface VisualizationState {
  gapBp: number;
  hiddenThreshold: number;
  othersMode: OthersMode;
  commonOnly: boolean;
  denoise: boolean;
  sharedAxis: boolean;
  svgW: number;
  fontSize: number;
  hoverChunk: string | null;
  tooltip: TooltipInfo | null;
}

interface VisualizationActions {
  setGapBp: (v: number) => void;
  setHiddenThreshold: (v: number) => void;
  setOthersMode: (v: OthersMode | ((prev: OthersMode) => OthersMode)) => void;
  setCommonOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  setDenoise: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSharedAxis: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSvgW: (w: number) => void;
  setFontSize: (v: number) => void;
  setHoverChunk: (id: string | null) => void;
  setTooltip: (t: TooltipInfo | null) => void;
  clearHover: () => void;
}

export const useVisualizationStore = create<VisualizationState & VisualizationActions>((set) => ({
  gapBp: 100000,
  hiddenThreshold: 20,
  othersMode: OTHERS_CYCLE[0],
  commonOnly: true,
  denoise: true,
  sharedAxis: true,
  svgW: 900,
  fontSize: 11,
  hoverChunk: null,
  tooltip: null,

  setGapBp: (v) => set({ gapBp: Math.max(1000, v) }),
  setHiddenThreshold: (v) => set({ hiddenThreshold: Math.max(0, v) }),
  setOthersMode: (v) => set((s) => ({ othersMode: typeof v === "function" ? v(s.othersMode) : v })),
  setCommonOnly: (v) => set((s) => ({ commonOnly: typeof v === "function" ? v(s.commonOnly) : v })),
  setDenoise: (v) => set((s) => ({ denoise: typeof v === "function" ? v(s.denoise) : v })),
  setSharedAxis: (v) => set((s) => ({ sharedAxis: typeof v === "function" ? v(s.sharedAxis) : v })),
  setSvgW: (w) => set({ svgW: Math.max(w, 400) }),
  setFontSize: (v) => set({ fontSize: Math.max(6, v) }),
  setHoverChunk: (id) => set({ hoverChunk: id }),
  setTooltip: (t) => set({ tooltip: t }),
  clearHover: () => set({ hoverChunk: null, tooltip: null }),
}));
