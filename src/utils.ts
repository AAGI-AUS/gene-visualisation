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
  return Math.abs(a - b) / b < threshold;
};

/**
 * Parse a raw BED file string into typed rows.
 * Mirrors Python's loadBed(): tab-separated, no header, id = row index.
 */
export function parseBED(text: string): BedRow[] {
  return text
    .trim()
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line, id) => {
      const [chromosome = "", p1Raw = "0", p2Raw = "0", sign = "+"] = line.split("\t");
      return {
        id,
        chromosome,
        p1: Number(p1Raw) || 0,
        p2: Number(p2Raw) || 0,
        sign: sign as "+" | "-",
      };
    });
}

/**
 * Mirrors Python's queryGene().
 *
 * 1. Left-join queryRows onto baseRows by id.
 * 2. Compute isInvert, isTranslocation, mainEvent per row.
 * 3. Build per-chromosome-query percentage table; collapse chromosomes whose
 *    share ≤ groupThreshold into "others".
 * 4. Merge groupedQuery back onto every row.
 */
export function queryGene(
  baseRows: BedRow[],
  queryMap: Map<number, BedRow>,
  groupThreshold = 0.01
): ResultRow[] {
  // Step 1 – left join
  const queried = baseRows.reduce<Omit<ResultRow, "groupedQuery">[]>((acc, base) => {
    const query = queryMap.get(base.id);
    if (!query) return acc;

    const isInvert = base.sign !== query.sign;
    const isTranslocation = base.chromosome !== query.chromosome;
    const mainEvent: MainEvent = isTranslocation ? "translocation" : isInvert ? "inversion" : "synteny";

    acc.push({
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
    });
    return acc;
  }, []);

  // Step 3 – chromosomeQuery percentage table
  const total = queried.length || 1;
  const counts = new Map<string, number>();
  queried.forEach((r) => {
    const key = r.chromosomeQuery;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const groupedMap = new Map<string, string>();
  counts.forEach((n, chr) => {
    groupedMap.set(chr, n / total > groupThreshold ? chr : "others");
  });

  // Step 4 – attach groupedQuery
  return queried.map((r) => ({
    ...r,
    groupedQuery: groupedMap.get(r.chromosomeQuery) ?? "others",
  }));
}

/** Read a File object as UTF-8 text. */
export function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function getChromosomes(rows: BedRow[]): string[] {
  return Array.from(
    rows.reduce<Set<string>>((set, r) => {
      const chr = r.chromosome;
      if (chr && chr.length <= 2) set.add(chr);
      return set;
    }, new Set())
  );
}
