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

export interface IntraState {
  relabel: IntraRelabelMode;
  windowMbp: number;
  minBackbones: number;
  gapStopMbp: number;
  driftK: number;
  complexMin: number;
}

const clampIntra = (patch: Partial<IntraState>): Partial<IntraState> => {
  const out: Partial<IntraState> = { ...patch };
  if (out.windowMbp !== undefined) out.windowMbp = Math.max(0, out.windowMbp);
  if (out.minBackbones !== undefined) out.minBackbones = Math.max(1, out.minBackbones);
  if (out.gapStopMbp !== undefined) out.gapStopMbp = Math.max(0, out.gapStopMbp);
  if (out.driftK !== undefined) out.driftK = Math.max(0, out.driftK);
  if (out.complexMin !== undefined) out.complexMin = Math.max(1, Math.round(out.complexMin));
  return out;
};

interface VisualizationState {
  gapBp: number;
  hiddenThreshold: number;
  othersMode: OthersMode;
  commonOnly: boolean;
  denoise: boolean;
  sharedAxis: boolean;
  intra: IntraState;
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
  setIntra: (patch: Partial<IntraState> | ((prev: IntraState) => Partial<IntraState>)) => void;
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
  intra: {
    relabel: INTRA_RELABEL_CYCLE[0],
    windowMbp: 100,
    minBackbones: 10,
    gapStopMbp: 10,
    driftK: 0.5,
    complexMin: 10,
  },
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
  setIntra: (patch) =>
    set((s) => {
      const next = typeof patch === "function" ? patch(s.intra) : patch;
      return { intra: { ...s.intra, ...clampIntra(next) } };
    }),
  setBoundaryTicks: (v) => set((s) => ({ boundaryTicks: typeof v === "function" ? v(s.boundaryTicks) : v })),
  setStripBlankMbp: (v) => set({ stripBlankMbp: Math.max(0, v) }),
  setSvgW: (w) => set({ svgW: Math.max(w, 400) }),
  setFontSize: (v) => set({ fontSize: Math.max(6, v) }),
  setHoverChunk: (id) => set({ hoverChunk: id }),
  setTooltip: (t) => set({ tooltip: t }),
  clearHover: () => set({ hoverChunk: null, tooltip: null }),
}));
