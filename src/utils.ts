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

const checkNoise = (base: BedRow, query: BedRow | null, offLocThreshold: number) => {
  if (!query) return true;

  const widthBase = base.p2 - base.p1;
  const widthQuery = Math.abs(query.p2 - query.p1);

  const midBpBase = (base.p1 + base.p2) / 2;
  const midBpQuery = (query.p1 + query.p2) / 2;
  const offMid = Math.abs(midBpBase - midBpQuery) / midBpBase;

  return widthQuery <= 0 || !withinThreshold(widthQuery, widthBase) || offMid > offLocThreshold;
};

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
  queryRows: BedRow[],
  groupThreshold = 0.01,
  offLocThreshold = 0.05
): ResultRow[] {
  // Build a lookup map: id → query row
  const queryMap = new Map<number, BedRow>(queryRows.map((r) => [r.id, r]));

  // Step 1 – left join
  const queried = baseRows.map((base) => {
    const query = queryMap.get(base.id) ?? null;

    const isInvert = query?.sign === "-";
    const isTranslocation = query?.chromosome !== null && base.chromosome !== query?.chromosome;
    const mainEvent: MainEvent = isTranslocation ? "translocation" : isInvert ? "inversion" : "synteny";
    const isNoise = !isTranslocation && checkNoise(base, query, offLocThreshold);

    return {
      id: base.id,
      chromosomeBase: base.chromosome,
      p1Base: base.p1,
      p2Base: base.p2,
      chromosomeQuery: query?.chromosome ?? null,
      p1Query: query?.p1 ?? 0,
      p2Query: query?.p2 ?? 0,
      sign: query?.sign ?? null,
      isInvert,
      isTranslocation,
      mainEvent,
      isNoise,
    };
  });

  // Step 2 – classify events
  // const queried = queried.map((r) => {
  //   const isInvert = r.sign === "-";
  //   const isTranslocation =
  //     r.chromosomeQuery !== null && r.chromosomeBase !== r.chromosomeQuery;
  //   const mainEvent: MainEvent = isTranslocation
  //     ? "translocation"
  //     : isInvert
  //       ? "inversion"
  //       : "synteny";
  //   return { ...r, isInvert, isTranslocation, mainEvent };
  // });

  // Step 3 – chromosomeQuery percentage table
  const total = queried.length || 1;
  const counts = new Map<string, number>();
  queried.forEach((r) => {
    const key = r.chromosomeQuery ?? "__null__";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const groupedMap = new Map<string, string>();
  counts.forEach((n, chr) => {
    const pct = n / total;
    groupedMap.set(chr, pct > groupThreshold ? chr : "others");
  });

  // Step 4 – attach groupedQuery
  return queried.map((r) => ({
    ...r,
    groupedQuery: groupedMap.get(r.chromosomeQuery ?? "__null__") ?? "others",
  }));
}

/** Read a File object as UTF-8 text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
