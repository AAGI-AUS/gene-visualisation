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

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────

export const CHROM_THICKNESS = 2;
export const RIBBON_GAP = 0;
export const ROW_GAP = 55;
export const PAD = { top: 18, bottom: 18, left: 90, right: 13 } as const;
export const FONT = "IBM Plex Mono, monospace";
export const CHR_GAP_PX = 3;
export const OTHERS_W = 24;
export const TOOLTIP_SPACING = 233;
export const SVG_H = PAD.top + CHROM_THICKNESS + ROW_GAP + CHROM_THICKNESS + PAD.bottom;
export const TICK_INTERVAL_BP = 100_000_000;

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
