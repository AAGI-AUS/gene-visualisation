import { BedRow, ResultRow, MainEvent } from "../types";

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

export const withinThreshold = (a: number, b: number, threshold = 0.1) => {
  return Math.abs(a / b - 1) < threshold;
};

/**
 * Parse a raw BED file string into typed rows.
 * Mirrors Python's loadBed(): tab-separated, no header, id = row index.
 */
export const parseBED = (text: string): BedRow[] => {
  return text
    .trim()
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .reduce<BedRow[]>((rows, line, idx) => {
      const [chromosome = "", p1Raw = "0", p2Raw = "0", sign = "+", idRaw] = line.split("\t");
      const p1 = Number(p1Raw) || 0;
      const p2 = Number(p2Raw) || 0;
      const id = Number(idRaw) || idx;
      if (validChromosomes(chromosome) && p1 < p2) {
        rows.push({ id, chromosome, p1, p2, sign: sign as "+" | "-" });
      }
      return rows;
    }, []);
};

const validChromosomes = (chr: string) => chr.length === 2;

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
