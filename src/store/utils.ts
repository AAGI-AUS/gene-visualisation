import { CHR_PALETTE, COMMON_CHR_THRESHOLD } from "@/src/constants";
import type { ResultRow } from "@/types";

export const buildPalette = (selectedChr: string, chroms: Iterable<string>): Record<string, string> => {
  const ordered = new Set<string>([selectedChr, ...chroms]);
  const palette: Record<string, string> = {};
  [...ordered].forEach((chr, i) => {
    palette[chr] = CHR_PALETTE[i % CHR_PALETTE.length];
  });
  return palette;
};

/**
 * Gene ids that are present in every pair AND whose chromosomeQuery accounts
 * for at least COMMON_CHR_THRESHOLD of the common-id population on each pair.
 * Computed once per analysis run so the viz layer can filter cheaply.
 */
export const computeCommonIds = (
  pairs: { rows: ResultRow[] }[],
  threshold: number = COMMON_CHR_THRESHOLD
): Set<number> => {
  if (pairs.length === 0) return new Set();

  const mapById = pairs.map((p) => new Map(p.rows.map((r) => [r.id, r])));
  const [first, ...rest] = mapById;

  const commonIds: number[] = [];
  for (const id of first.keys()) {
    if (rest.every((m) => m.has(id))) commonIds.push(id);
  }
  if (commonIds.length === 0) return new Set();

  const allowedChrs = mapById.map((m) => {
    const counts = new Map<string, number>();
    for (const id of commonIds) {
      const chr = m.get(id)!.chromosomeQuery;
      counts.set(chr, (counts.get(chr) ?? 0) + 1);
    }
    const allowed = new Set<string>();
    counts.forEach((n, chr) => {
      if (n / commonIds.length >= threshold) allowed.add(chr);
    });
    return allowed;
  });

  const finalIds = new Set<number>();
  for (const id of commonIds) {
    if (mapById.every((m, i) => allowedChrs[i].has(m.get(id)!.chromosomeQuery))) {
      finalIds.add(id);
    }
  }
  return finalIds;
};
