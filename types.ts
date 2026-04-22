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
