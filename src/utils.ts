import type { BedRow, CentromereData, ResultRow, MainEvent } from "../types";
import { LINE_MAPPING } from "./constants";

export const min = <T extends number | string>(...array: T[]): T => {
  if (typeof array[0] === "string") {
    return (array as string[]).reduce((a, b) => (a.localeCompare(b) < 0 ? a : b)) as T;
  }

  return Math.min(...(array as number[])) as T;
};

export const max = <T extends number | string>(...array: T[]): T => {
  if (typeof array[0] === "string") {
    return (array as string[]).reduce((a, b) => (a.localeCompare(b) > 0 ? a : b)) as T;
  }

  return Math.max(...(array as number[])) as T;
};

export const clamp = (value: number, lo: number, hi: number): number => Math.min(Math.max(value, lo), hi);
export const closeTo = (a: number, b: number, threshold = 0.1) => Math.abs(a / b - 1) < threshold;

const cleanChr = (chr: string, prefix: string) =>
  !prefix ? chr : chr.replace(`${prefix}_chr`, "").replace(`${prefix}_`, "");

/**
 * Parse a raw BED file string into typed rows.
 */
export const parseBED = (text: string, fileName = ""): BedRow[] =>
  text
    .trim()
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .reduce<BedRow[]>((rows, line, idx) => {
      const [chromosomeRaw = "", p1Raw = "0", p2Raw = "0", sign = "+", idRaw] = line.split("\t");
      // Input is 1-based inclusive; normalize to 0-based half-open so p2 - p1 is the true span.
      const p1 = (Number(p1Raw) ?? 0) - 1;
      const p2 = Number(p2Raw) ?? 0;
      const id = Number(idRaw);
      const chromosome = cleanChr(chromosomeRaw, fileName.split(".")[0]);
      if (validChromosomes(chromosome) && p1 < p2 && p1 >= 0) {
        rows.push({ id: !isNaN(id) ? id : idx, chromosome, p1, p2, sign: sign as "+" | "-" });
      }
      return rows;
    }, []);

const invalidChromosomes = new Set(["un"]);
const validChromosomes = (chr: string) => chr.length === 2 && !invalidChromosomes.has(chr.toLowerCase());

/**
 * Mirrors Python's queryGene().
 *
 * 1. Left-join queryRows onto baseRows by id.
 * 2. Compute isInvert, isTranslocation, mainEvent per row.
 * 3. Build per-chromosome-query percentage table; collapse chromosomes whose
 *    share ≤ groupThreshold into "others".
 * 4. Merge groupedQuery back onto every row.
 */
export const queryGene = (
  baseRows: BedRow[],
  queryMap: Map<number, BedRow>,
  groupThreshold = 0.01
): { rows: ResultRow[]; chromosomes: string[] } => {
  // Step 1 – left join + chromosomeQuery tally in one pass
  const queried: ResultRow[] = [];
  const counts = new Map<string, number>();
  for (const base of baseRows) {
    const query = queryMap.get(base.id);
    if (!query) continue;

    const isInvert = base.sign !== query.sign;
    const isTranslocation = base.chromosome !== query.chromosome;
    const mainEvent: MainEvent = isTranslocation ? "translocation" : isInvert ? "inversion" : "synteny";

    queried.push({
      id: base.id,
      chromosomeBase: base.chromosome,
      p1Base: base.p1,
      p2Base: base.p2,
      chromosomeQuery: query.chromosome,
      p1Query: query.p1,
      p2Query: query.p2,
      sign: query.sign,
      isInvert,
      isTranslocation,
      mainEvent,
      groupedQuery: "",
    });
    counts.set(query.chromosome, (counts.get(query.chromosome) ?? 0) + 1);
  }

  // Step 2 – build groupedMap from counts
  const total = queried.length || 1;
  const groupedMap = new Map<string, string>();
  const chromosomes: string[] = [];
  counts.forEach((n, chr) => {
    if (n / total > groupThreshold) {
      groupedMap.set(chr, chr);
      chromosomes.push(chr);
    } else {
      groupedMap.set(chr, "others");
    }
  });

  // Step 3 – attach groupedQuery in place (no spread allocation per row)
  for (const r of queried) {
    r.groupedQuery = groupedMap.get(r.chromosomeQuery) ?? "others";
  }

  return { rows: queried, chromosomes };
};

/**
 * Parse a centromere csv into a per-line, per-chromosome lookup of base-pair positions.
 *
 * The file is tab-separated with a header row: first column is "Genome Assembly"
 * (matched against `lineMapping` to resolve the short line code), the remaining
 * columns are chromosome names (e.g. "chr1A") with values in Mbp. A genome
 * assembly may appear on more than one row; all of its positions accumulate.
 * Unknown assemblies, empty cells, and non-numeric cells are skipped silently.
 */
export const parseCentromere = (text: string): CentromereData => {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const out: CentromereData = new Map();
  if (lines.length < 2) return out;

  const header = lines[0].split(",");
  const chrs = header.slice(1).map((h) => h.trim().replace(/^chr/i, ""));

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const assembly = cells[0]?.trim();
    const lineKey = LINE_MAPPING[assembly as keyof typeof LINE_MAPPING];
    if (!lineKey) continue;

    let chrMap = out.get(lineKey);
    if (!chrMap) {
      chrMap = new Map();
      out.set(lineKey, chrMap);
    }

    for (let j = 0; j < chrs.length; j++) {
      const raw = cells[j + 1]?.trim();
      if (!raw) continue;
      const mbp = Number(raw);
      if (!Number.isFinite(mbp)) continue;
      const bp = mbp * 1e6;
      const chr = chrs[j];
      const positions = chrMap.get(chr);
      if (positions) positions.push(bp);
      else chrMap.set(chr, [bp]);
    }
  }

  return out;
};

/** Read a File object as UTF-8 text. */
export const fileToText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};

export const getChromosomes = (rows: BedRow[]): string[] => {
  return Array.from(
    rows.reduce<Set<string>>((set, r) => {
      const chr = r.chromosome;
      if (!set.has(chr)) set.add(chr);
      return set;
    }, new Set())
  );
};
