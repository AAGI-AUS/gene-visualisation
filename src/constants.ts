export const CHUNK_COLOR: Record<ChunkEvent, string> = {
  synteny: "#3b82f6",
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
export const RIBBON_GAP = 3;
export const ROW_GAP = 150;
export const PAD = { top: 44, bottom: 40, left: 90, right: 28 } as const;
export const FONT = "IBM Plex Mono, monospace";
export const CHR_GAP_PX = 3;
export const OTHERS_W = 24;
const TOOLTIP_ROOM = 200;
export const SVG_H = PAD.top + CHROM_THICKNESS + ROW_GAP + CHROM_THICKNESS + PAD.bottom + TOOLTIP_ROOM;

export const chunkEvents = ["synteny", "inversion", "translocation", "translocation+inversion"] as const;
export type ChunkEvent = (typeof chunkEvents)[number];
