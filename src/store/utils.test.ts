import { CHR_PALETTE } from "@/src/constants";
import { buildPalette, computeCommonIds } from "@/src/store/utils";
import type { ResultRow } from "@/types";

const makeRow = (id: number, chromosomeQuery: string): ResultRow => ({
  id,
  chromosomeBase: "1A",
  p1Base: id * 100,
  p2Base: id * 100 + 50,
  chromosomeQuery,
  p1Query: 0,
  p2Query: 50,
  sign: "+",
  isInvert: false,
  isTranslocation: false,
  mainEvent: "synteny",
  groupedQuery: chromosomeQuery,
});

describe("buildPalette", () => {
  test("places selectedChr first and assigns colors from CHR_PALETTE", () => {
    const palette = buildPalette("1A", ["2B", "3D"]);
    expect(palette).toEqual({
      "1A": CHR_PALETTE[0],
      "2B": CHR_PALETTE[1],
      "3D": CHR_PALETTE[2],
    });
  });

  test("deduplicates selectedChr if it also appears in the chromosome iterable", () => {
    const palette = buildPalette("1A", ["1A", "2B"]);
    expect(Object.keys(palette)).toEqual(["1A", "2B"]);
    expect(palette["1A"]).toBe(CHR_PALETTE[0]);
    expect(palette["2B"]).toBe(CHR_PALETTE[1]);
  });

  test("cycles colors when chromosomes exceed the palette length", () => {
    const extras = Array.from({ length: CHR_PALETTE.length }, (_, i) => `c${i}`);
    const palette = buildPalette("seed", extras);
    expect(palette["seed"]).toBe(CHR_PALETTE[0]);
    // The last extra wraps around to index 0 again.
    expect(palette[extras[extras.length - 1]]).toBe(CHR_PALETTE[0]);
  });
});

describe("computeCommonIds", () => {
  test("returns an empty set when given no pairs", () => {
    expect(computeCommonIds([])).toEqual(new Set());
  });

  test("returns an empty set when pairs share no ids", () => {
    const pairs = [{ rows: [makeRow(1, "1A")] }, { rows: [makeRow(2, "1A")] }];
    expect(computeCommonIds(pairs, 0)).toEqual(new Set());
  });

  test("keeps ids present in every pair when threshold is 0", () => {
    const pairs = [
      { rows: [makeRow(1, "1A"), makeRow(2, "1A")] },
      { rows: [makeRow(1, "2B"), makeRow(2, "2B"), makeRow(3, "2B")] },
    ];
    expect(computeCommonIds(pairs, 0)).toEqual(new Set([1, 2]));
  });

  test("drops ids whose query chromosome falls below the threshold in any pair", () => {
    // 10 common ids. In pair B, id 10 maps to a rare chromosome (1/10 = 0.1)
    // and the threshold below is 0.2, so id 10 is excluded from the result.
    const common = Array.from({ length: 10 }, (_, i) => i + 1);
    const pairA = common.map((id) => makeRow(id, "1A"));
    const pairB = common.map((id) => makeRow(id, id === 10 ? "rare" : "2B"));

    expect(computeCommonIds([{ rows: pairA }, { rows: pairB }], 0.2)).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])
    );
  });

  test("uses the default COMMON_CHR_THRESHOLD when none is supplied", () => {
    // With default threshold 0.1, a chromosome carrying exactly 1/10 ids
    // still satisfies the >= threshold check and is kept.
    const common = Array.from({ length: 10 }, (_, i) => i + 1);
    const pair = common.map((id) => makeRow(id, id === 10 ? "minor" : "major"));
    expect(computeCommonIds([{ rows: pair }])).toEqual(new Set(common));
  });
});
