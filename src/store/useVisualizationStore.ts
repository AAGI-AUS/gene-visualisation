import { OTHERS_CYCLE, OthersMode } from "@/src/constants";
import { TooltipInfo } from "@/types";
import { create } from "zustand";

export const INTRA_RELABEL_CYCLE = ["score", "minor", "off"] as const;
export type IntraRelabelMode = (typeof INTRA_RELABEL_CYCLE)[number];
export const INTRA_RELABEL_LABEL: Record<IntraRelabelMode, string> = {
  off: "Intra: off",
  minor: "Intra: minor",
  score: "Intra: score",
};

interface VisualizationState {
  gapBp: number;
  hiddenThreshold: number;
  othersMode: OthersMode;
  commonOnly: boolean;
  denoise: boolean;
  sharedAxis: boolean;
  intraRelabel: IntraRelabelMode;
  intraWindowMbp: number;
  intraMinBackbones: number;
  intraGapStopRatio: number;
  intraDriftPctOff: number;
  boundaryTicks: boolean;
  stripBlankMbp: number;
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
  setIntraRelabel: (v: IntraRelabelMode | ((prev: IntraRelabelMode) => IntraRelabelMode)) => void;
  setIntraWindowMbp: (v: number) => void;
  setIntraMinBackbones: (v: number) => void;
  setIntraGapStopRatio: (v: number) => void;
  setIntraDriftPctOff: (v: number) => void;
  setBoundaryTicks: (v: boolean | ((prev: boolean) => boolean)) => void;
  setStripBlankMbp: (v: number) => void;
  setSvgW: (w: number) => void;
  setFontSize: (v: number) => void;
  setHoverChunk: (id: string | null) => void;
  setTooltip: (t: TooltipInfo | null) => void;
  clearHover: () => void;
}

export const useVisualizationStore = create<VisualizationState & VisualizationActions>((set) => ({
  gapBp: 100,
  hiddenThreshold: 10,
  othersMode: OTHERS_CYCLE[0],
  commonOnly: true,
  denoise: true,
  sharedAxis: true,
  intraRelabel: INTRA_RELABEL_CYCLE[0],
  intraWindowMbp: 100,
  intraMinBackbones: 10,
  intraGapStopRatio: 3,
  intraDriftPctOff: 0.2,
  boundaryTicks: false,
  stripBlankMbp: 300,
  svgW: 900,
  fontSize: 11,
  hoverChunk: null,
  tooltip: null,

  setGapBp: (v) => set({ gapBp: Math.max(100, v) }),
  setHiddenThreshold: (v) => set({ hiddenThreshold: Math.max(0, v) }),
  setOthersMode: (v) => set((s) => ({ othersMode: typeof v === "function" ? v(s.othersMode) : v })),
  setCommonOnly: (v) => set((s) => ({ commonOnly: typeof v === "function" ? v(s.commonOnly) : v })),
  setDenoise: (v) => set((s) => ({ denoise: typeof v === "function" ? v(s.denoise) : v })),
  setSharedAxis: (v) => set((s) => ({ sharedAxis: typeof v === "function" ? v(s.sharedAxis) : v })),
  setIntraRelabel: (v) => set((s) => ({ intraRelabel: typeof v === "function" ? v(s.intraRelabel) : v })),
  setIntraWindowMbp: (v) => set({ intraWindowMbp: Math.max(0, v) }),
  setIntraMinBackbones: (v) => set({ intraMinBackbones: Math.max(1, v) }),
  setIntraGapStopRatio: (v) => set({ intraGapStopRatio: Math.max(1, v) }),
  setIntraDriftPctOff: (v) => set({ intraDriftPctOff: Math.max(0, v) }),
  setBoundaryTicks: (v) => set((s) => ({ boundaryTicks: typeof v === "function" ? v(s.boundaryTicks) : v })),
  setStripBlankMbp: (v) => set({ stripBlankMbp: Math.max(0, v) }),
  setSvgW: (w) => set({ svgW: Math.max(w, 400) }),
  setFontSize: (v) => set({ fontSize: Math.max(6, v) }),
  setHoverChunk: (id) => set({ hoverChunk: id }),
  setTooltip: (t) => set({ tooltip: t }),
  clearHover: () => set({ hoverChunk: null, tooltip: null }),
}));
