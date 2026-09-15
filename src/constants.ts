export const CHUNK_COLOR: Record<ChunkEvent, string> = {
  synteny: "darkgrey",
  inversion: "#f59e0b",
  translocation: "#ef4444",
  "translocation+inversion": "#a855f7",
};

export const CHR_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
  "#d946ef",
  "#0ea5e9",
  "#fb923c",
  "#a3e635",
];

export const OTHERS_COL = "#94a3b8";
export const COLOR = {
  muted: "dimgrey",
};

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────

export const CHROM_THICKNESS = 2;
export const RIBBON_GAP = 0;
export const ROW_GAP = 55;
export const LINE_LABEL_GAP = 5;
export const LEGEND_H = 24;
export const PAD = { top: 28 + LEGEND_H, bottom: 18, left: 112, right: 13 } as const;
export const FONT = "IBM Plex Mono, monospace";
export const CHR_GAP_PX = 3;
export const OTHERS_W = 24;
export const TOOLTIP_SPACING = 233;
export const SVG_H = PAD.top + CHROM_THICKNESS + ROW_GAP + CHROM_THICKNESS + PAD.bottom;
export const DEFAULT_TICK_STEP_BP = 100_000_000;
export const TICK_TARGET_PX = 80;
export const TICK_TARGET_EM = 7;
export const MAX_TICKS_PER_CHR = 10;

export const chunkEvents = ["synteny", "inversion", "translocation", "translocation+inversion"] as const;
export type ChunkEvent = (typeof chunkEvents)[number];

export const COMMON_CHR_THRESHOLD = 0.1;

export const OTHERS_CYCLE = ["hide", "show", "group"] as const;
export type OthersMode = (typeof OTHERS_CYCLE)[number];
export const OTHERS_LABEL: Record<OthersMode, string> = {
  hide: "Hide others",
  group: "Group others",
  show: "Show all",
};

// ─────────────────────────────────────────────────────────────────────────────
// Hover help (see src/help.ts); an empty string renders no bubble
// ─────────────────────────────────────────────────────────────────────────────

export const HELP = {
  // Sidebar parameters
  selectedChr: "",
  groupThreshold:
    "Query chromosomes holding this share or less of the genes are hidden. Higher = more chromosomes hidden.",
  workerCount: "Number of CPU cores used. Higher = more CPU and RAM used.",

  // Visualization toolbar
  gapBp: "Genes further apart than this on the base start a new block. Higher = fewer, longer blocks.",
  hiddenThreshold: "blocks with this many genes or fewer are hidden. Higher = fewer blocks drawn.",
  stripBlankMbp:
    "Largest leading blank kept when snapping a chromosome to the shared axis; wider blanks are trimmed instead. Higher = fewer trims, 0 = never trim.",
  othersMode:
    "Query chromosomes collapsed by the group threshold. Cycles hide → group into one slot → show every chromosome.",
  commonOnly: "Keep only genes present in every query file.",
  denoise: "Drop genes that survive blocking in some queries but not all.",
  sharedAxis: "Give each chromosome one bp scale across all rows.",
  tickIntervalMbp:
    "Spacing between shared-axis tick lines. 0 = pick a round spacing that fits the current width and font.",
  boundaryTicks:
    "Label the axis at every row boundary. Off, only the last row of each shared scale is labelled.",
  showMarks: "Draw centromere and predicted-centromere (wheat only) marks on each chromosome bar.",
  fontSize: "",
  svgW: "",

  intraRelabel:
    "Relabel same-chromosome blocks to translocation where query position offset disagrees with the surrounding backbone.",
  minLocalEvents: "Minimum genes around a region to be taken as its local backbone. Higher = wider backbone.",
  gapStopMbp:
    "The backbone stops at the first gap this wide. Higher = crossing bigger gaps for a distant reference.",
  driftK:
    "How far a block must drift from the local backbone to be re-labelled (0-1, after normalising). Higher = fewer re-labels.",
  complexMin:
    "Distinct score groups in a region before its chromosome gets another relabel pass. Higher = fewer passes.",

  // Summary tab
  coreOverride: "Override the computed genome-wide core fraction on the overall bar. Empty = computed.",
};

export const LINE_MAPPING = {
  "Chinese Spring (dataset 1)a": "cs",
  "Chinese Spring (dataset 2)a": "cs",
  ArinaLrFor: "arina",
  Jagger: "jagger",
  Julius: "julius",
  "LongReach Lancer": "lancer",
  "CDC Landmark": "landmark",
  Mace: "mace",
  "SY Mattis": "mattis",
  "Norin 61": "norin61",
  "CDC Stanley": "stanley",
};
