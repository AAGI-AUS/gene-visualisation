import { ChunkEvent } from "@/src/constants";

/** A single record from a parsed BED file. */
export interface BedRow {
  id: number;
  chromosome: string;
  p1: number;
  p2: number;
  sign: "+" | "-";
}

/** A loaded BED file, including its parsed rows. */
export interface BedFile {
  name: string;
  rows: BedRow[];
}

export type MainEvent = "synteny" | "inversion" | "translocation" | "noise";

/** The merged / enriched row produced by queryGene(). */
export interface ResultRow {
  id: number;
  chromosomeBase: string;
  p1Base: number;
  p2Base: number;
  chromosomeQuery: string | null;
  p1Query: number;
  p2Query: number;
  sign: "+" | "-" | null;
  isInvert: boolean;
  isTranslocation: boolean;
  mainEvent: MainEvent;
  groupedQuery: string;
  isNoise: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout types
// ─────────────────────────────────────────────────────────────────────────────

export interface ChrBar {
  kind: "chr";
  chr: string;
  px: number;
  pw: number;
  bpLen: number;
  p1: number;
  colorIdx: number;
}

export interface OthersBar {
  kind: "others";
  baseChr: string;
  side: "left" | "right";
  px: number;
  pw: number;
  targetX: number;
}

export type QuerySlot = ChrBar | OthersBar;

export interface BaseRow {
  label: string;
  bars: ChrBar[];
  y: number;
}

export interface QueryRow {
  label: string;
  slots: QuerySlot[];
  y: number;
}

export type QuerySlotLookup = {
  others: {
    left: OthersBar;
    right: OthersBar;
  };
  chromosome: { [key: string]: ChrBar };
};

// ─────────────────────────────────────────────────────────────────────────────
// Analysis types
// ─────────────────────────────────────────────────────────────────────────────

export interface EventCounts {
  synteny: number;
  inversion: number;
  translocation: number;
  "translocation+inversion": number;
  total: number;
  [key: string]: number;
}

/** A contiguous block of ResultRows grouped by position and event type. */
export interface Chunk {
  id: string;
  chrBase: string;
  bp1Base: number;
  bp2Base: number;
  bpGeneBase: number;
  chrQuery: string;
  bp1Query: number;
  bp2Query: number;
  bpGeneQuery: number;
  dominant: ChunkEvent;
  eventCounts: EventCounts;
  queryChromCounts: { [key: string]: number };
  isInvert: boolean;
  isOthers: boolean;
}

export interface ChunkRibbon {
  chunk: Chunk;
  bxs: number;
  bxe: number;
  qxs: number;
  qxe: number;
}

export interface TooltipInfo {
  /** SVG x-coordinate of the ribbon midpoint (used to horizontally centre the tooltip) */
  ribbonMidX: number;
  chunk: Chunk;
}
