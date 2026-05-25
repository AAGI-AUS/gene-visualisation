import {
  bpToPx,
  buildBaseRow,
  buildChunk,
  buildQueryRow,
  chunkRows,
  collectNoisyIds,
  computeRibbons,
  dominantEvent,
  findLargestGapCenter,
  getPredictingLines,
  getPredictingRange,
  pct,
  ribbonPath,
  rowCategory,
  SlotSpec,
  zeroCounts,
} from "@/src/components/visualizationTab/utils";
import { CHR_GAP_PX, CHROM_THICKNESS, OTHERS_W, PAD, ROW_GAP } from "@/src/constants";
import type { ChrBar, Chunk, ResultRow } from "@/types";

const makeRow = (overrides: Partial<ResultRow> = {}): ResultRow => ({
  id: 0,
  chromosomeBase: "1A",
  p1Base: 0,
  p2Base: 100,
  chromosomeQuery: "1A",
  p1Query: 0,
  p2Query: 100,
  sign: "+",
  isInvert: false,
  isTranslocation: false,
  mainEvent: "synteny",
  groupedQuery: "1A",
  ...overrides,
});

describe("rowCategory", () => {
  test("returns the event matching the row's flags", () => {
    expect(rowCategory(makeRow())).toBe("synteny");
    expect(rowCategory(makeRow({ isInvert: true, mainEvent: "inversion" }))).toBe("inversion");

    const translocationProps = {
      isTranslocation: true,
      mainEvent: "translocation",
      chromosomeQuery: "2B",
    } as const;
    expect(rowCategory(makeRow(translocationProps))).toBe("translocation");
    expect(rowCategory(makeRow({ ...translocationProps, isInvert: true }))).toBe("translocation+inversion");
  });
});

describe("zeroCounts / dominantEvent", () => {
  test("zeroCounts initialises every key to 0", () => {
    expect(zeroCounts()).toEqual({
      synteny: 0,
      inversion: 0,
      translocation: 0,
      "translocation+inversion": 0,
      total: 0,
    });
  });

  test("dominantEvent picks the key with the highest count", () => {
    const counts = { ...zeroCounts(), synteny: 2, inversion: 5, translocation: 1 };
    counts.total = 8;
    expect(dominantEvent(counts)).toBe("inversion");
  });

  test("dominantEvent ties break to the first chunkEvents entry", () => {
    const counts = { ...zeroCounts(), synteny: 3, inversion: 3, translocation: 0 };
    counts.total = 6;
    expect(dominantEvent(counts)).toBe("synteny");
  });
});

describe("collectNoisyIds", () => {
  test("returns an empty set when there is at most one pair", () => {
    expect(collectNoisyIds([])).toEqual(new Set());
    expect(collectNoisyIds([[makeChunk([1, 2])]])).toEqual(new Set());
  });

  test("flags ids missing from at least one pair", () => {
    const chunksPair1 = [makeChunk([1, 2, 3])];
    const chunksPair2 = [makeChunk([2, 3, 4])];
    expect(collectNoisyIds([chunksPair1, chunksPair2])).toEqual(new Set([1, 4]));
  });

  test("returns an empty set when every id appears in every pair", () => {
    const chunks = [makeChunk([1, 2, 3])];
    expect(collectNoisyIds([chunks, [makeChunk([3, 2, 1])]])).toEqual(new Set());
  });
});

const makeChunk = (ids: number[]): Chunk =>
  ({
    id: `chunk-${ids.join("-")}`,
    ids,
    chrBase: "1A",
    bp1Base: 0,
    bp2Base: 100,
    bpGeneBase: 100,
    chrQuery: "1A",
    bp1Query: 0,
    bp2Query: 100,
    bpGeneQuery: 100,
    dominant: "synteny",
    eventCounts: { ...zeroCounts(), synteny: ids.length, total: ids.length },
    queryChromCounts: { "1A": ids.length },
    isInvert: false,
    isOthers: false,
  }) as Chunk;

describe("buildChunk", () => {
  test("aggregates ids, bp ranges, and event counts", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Base: 0, p2Base: 100, p1Query: 0, p2Query: 100 }),
      makeRow({ id: 2, p1Base: 150, p2Base: 250, p1Query: 150, p2Query: 250 }),
      makeRow({ id: 3, p1Base: 300, p2Base: 400, p1Query: 300, p2Query: 400 }),
    ];
    const chunk = buildChunk(rows, 7, "lineA");
    expect(chunk.id).toBe("lineA-1A-7");
    expect(chunk.ids).toEqual([1, 2, 3]);
    expect(chunk.chrBase).toBe("1A");
    expect(chunk.bp1Base).toBe(0);
    expect(chunk.bp2Base).toBe(400);
    expect(chunk.bpGeneBase).toBe(300);
    expect(chunk.chrQuery).toBe("1A");
    expect(chunk.bp1Query).toBe(0);
    expect(chunk.bp2Query).toBe(400);
    expect(chunk.bpGeneQuery).toBe(300);
    expect(chunk.dominant).toBe("synteny");
    expect(chunk.eventCounts.synteny).toBe(3);
    expect(chunk.eventCounts.total).toBe(3);
    expect(chunk.isInvert).toBe(false);
    expect(chunk.isOthers).toBe(false);
  });

  test("picks the dominant query chromosome by count", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, chromosomeQuery: "1A", p1Query: 0, p2Query: 100 }),
      makeRow({ id: 2, chromosomeQuery: "2B", p1Query: 0, p2Query: 100 }),
      makeRow({ id: 3, chromosomeQuery: "2B", p1Query: 100, p2Query: 200 }),
    ];
    const chunk = buildChunk(rows, 0, "lineA");
    expect(chunk.chrQuery).toBe("2B");
    expect(chunk.bp1Query).toBe(0);
    expect(chunk.bp2Query).toBe(200);
    expect(chunk.queryChromCounts).toEqual({ "1A": 1, "2B": 2 });
  });

  test("marks isInvert when the dominant query rows are mostly inverted", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, isInvert: true, mainEvent: "inversion" }),
      makeRow({ id: 2, isInvert: true, mainEvent: "inversion" }),
      makeRow({ id: 3, isInvert: false }),
    ];
    const chunk = buildChunk(rows, 0, "lineA");
    expect(chunk.isInvert).toBe(true);
  });

  test("marks isOthers when most rows are grouped as 'others'", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, chromosomeQuery: "rare1", groupedQuery: "others" }),
      makeRow({ id: 2, chromosomeQuery: "rare2", groupedQuery: "others" }),
      makeRow({ id: 3, chromosomeQuery: "1A", groupedQuery: "1A" }),
    ];
    const chunk = buildChunk(rows, 0, "lineA");
    expect(chunk.isOthers).toBe(true);
  });

  test("non-synteny rows don't extend the query bp range when synteny dominates", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Query: 0, p2Query: 100 }),
      makeRow({ id: 2, p1Query: 100, p2Query: 200 }),
      makeRow({ id: 3, p1Query: 200, p2Query: 300 }),
      // dominant stays "synteny" (3 vs 1); this row's query range is excluded.
      makeRow({ id: 4, isInvert: true, mainEvent: "inversion", p1Query: 1000, p2Query: 2000 }),
    ];
    const chunk = buildChunk(rows, 0, "lineA");
    expect(chunk.dominant).toBe("synteny");
    expect(chunk.bp1Query).toBe(0);
    expect(chunk.bp2Query).toBe(300);
  });
});

describe("chunkRows", () => {
  test("returns no chunks for empty input", () => {
    expect(chunkRows([], 100, "lineA")).toEqual([]);
  });

  test("keeps rows together when the base gap is within gapBp", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Base: 0, p2Base: 100, p1Query: 0, p2Query: 100 }),
      makeRow({ id: 2, p1Base: 110, p2Base: 200, p1Query: 110, p2Query: 200 }),
    ];
    const chunks = chunkRows(rows, 50, "lineA");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].ids).toEqual([1, 2]);
  });

  test("splits rows where the base gap exceeds gapBp", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Base: 0, p2Base: 100, p1Query: 0, p2Query: 100 }),
      makeRow({ id: 2, p1Base: 1000, p2Base: 1100, p1Query: 1000, p2Query: 1100 }),
    ];
    const chunks = chunkRows(rows, 50, "lineA");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].ids).toEqual([1]);
    expect(chunks[1].ids).toEqual([2]);
  });

  test("keeps non-translocation and translocation rows in separate chunks", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Base: 0, p2Base: 100 }),
      makeRow({
        id: 2,
        p1Base: 100,
        p2Base: 200,
        chromosomeQuery: "2B",
        isTranslocation: true,
        mainEvent: "translocation",
        groupedQuery: "2B",
      }),
    ];
    const chunks = chunkRows(rows, 1000, "lineA");
    expect(chunks).toHaveLength(2);
    expect(chunks.flatMap((c) => c.ids).sort()).toEqual([1, 2]);
  });

  test("strict mode splits when the query span is disproportional to the base span", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Base: 0, p2Base: 100, p1Query: 0, p2Query: 100 }),
      // Base gap is 10 (well within gapBp=50), but the query jumps to ~2000.
      // withinThreshold(2000, 200) is false → strict mode forces a split.
      makeRow({ id: 2, p1Base: 110, p2Base: 200, p1Query: 1000, p2Query: 2000 }),
    ];
    const chunks = chunkRows(rows, 50, "lineA");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].ids).toEqual([1]);
    expect(chunks[1].ids).toEqual([2]);
  });

  test("strict mode splits non-inverted rows whose query lies before the chunk start", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Base: 0, p2Base: 100, p1Query: 100, p2Query: 200 }),
      // Same-sign rows with proportional query span (200) but cur.p2Query=50 < first.p1Query=100,
      // so the reverse-order guard rejects the merge even though withinThreshold passes.
      makeRow({ id: 2, p1Base: 110, p2Base: 200, p1Query: 0, p2Query: 50 }),
    ];
    const chunks = chunkRows(rows, 50, "lineA");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].ids).toEqual([1]);
    expect(chunks[1].ids).toEqual([2]);
  });

  test("translocation 'others' rows use non-strict sweep and stay together despite skewed query spans", () => {
    const rows: ResultRow[] = [
      makeRow({
        id: 1,
        p1Base: 0,
        p2Base: 100,
        chromosomeQuery: "rare1",
        p1Query: 0,
        p2Query: 100,
        isTranslocation: true,
        mainEvent: "translocation",
        groupedQuery: "others",
      }),
      makeRow({
        id: 2,
        p1Base: 110,
        p2Base: 200,
        chromosomeQuery: "rare2",
        // Wildly disproportional query span; strict would split, non-strict keeps them.
        p1Query: 1000,
        p2Query: 2000,
        isTranslocation: true,
        mainEvent: "translocation",
        groupedQuery: "others",
      }),
    ];
    const chunks = chunkRows(rows, 50, "lineA");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].ids).toEqual([1, 2]);
  });
});

describe("buildBaseRow", () => {
  test("returns no bars when chrOrder is empty", () => {
    const row = buildBaseRow(new Map(), new Map(), [], "label", 500, "hide");
    expect(row).toEqual({ label: "label", bars: [], y: PAD.top });
  });

  test("places bars consecutively with the configured gap between them", () => {
    const chrMax = new Map([
      ["1A", 100],
      ["2B", 100],
    ]);
    const chrMin = new Map([
      ["1A", 0],
      ["2B", 0],
    ]);
    const row = buildBaseRow(chrMax, chrMin, ["1A", "2B"], "label", 203, "hide");
    expect(row.bars).toHaveLength(2);
    expect(row.bars[0].px).toBe(0);
    expect(row.bars[1].px).toBe(row.bars[0].pw + CHR_GAP_PX);
    expect(row.bars[0].pw + row.bars[1].pw).toBe(200);
  });

  test("reserves an 'others' stub on the left when othersMode is 'group'", () => {
    const chrMax = new Map([["1A", 100]]);
    const chrMin = new Map([["1A", 0]]);
    const row = buildBaseRow(chrMax, chrMin, ["1A"], "label", 500, "group");
    expect(row.bars[0].px).toBe(OTHERS_W + CHR_GAP_PX);
  });

  test("perChrPxPerBp overrides rowPxPerBp per chr and stretches the last bar to fill availW", () => {
    const chrMax = new Map([
      ["1A", 100],
      ["2B", 100],
    ]);
    const chrMin = new Map([
      ["1A", 0],
      ["2B", 0],
    ]);
    // rowPxPerBp = (203 - 3 gap) / 200 = 1. 1A overridden to 0.5; 2B falls back to rowPxPerBp.
    const perChrPxPerBp = new Map([["1A", 0.5]]);
    const row = buildBaseRow(chrMax, chrMin, ["1A", "2B"], "label", 203, "hide", perChrPxPerBp);

    expect(row.bars[0].pw).toBe(50);
    expect(row.bars[0].bpLen).toBe(100);
    expect(row.bars[0].dataBpLen).toBeUndefined();

    // last bar absorbs the 50px deficit (50 / pxPerBp=1 → +50bp).
    expect(row.bars[1].pw).toBe(150);
    expect(row.bars[1].bpLen).toBe(150);
    expect(row.bars[1].dataBpLen).toBe(100);
    expect(row.bars[1].px + row.bars[1].pw).toBe(203);
  });
});

describe("buildQueryRow", () => {
  test("returns no slots when slotSpecs is empty", () => {
    const row = buildQueryRow([], "label", 200);
    expect(row).toEqual({
      label: "label",
      slots: [],
      y: PAD.top + CHROM_THICKNESS + ROW_GAP,
    });
  });

  test("lays out chr and others slots back-to-back with the configured gap", () => {
    const specs: SlotSpec[] = [
      { kind: "others", baseChr: "1A", side: "left" },
      { kind: "chr", chr: "1A", bpLen: 100, p1: 0 },
      { kind: "others", baseChr: "1A", side: "right" },
    ];
    const row = buildQueryRow(specs, "label", 200);
    expect(row.slots).toHaveLength(3);
    const [left, chr, right] = row.slots;
    expect(left.kind).toBe("others");
    expect(left.pw).toBe(OTHERS_W);
    expect(left.px).toBe(0);

    expect(chr.kind).toBe("chr");
    expect(chr.px).toBe(OTHERS_W + CHR_GAP_PX);

    expect(right.kind).toBe("others");
    expect(right.px).toBe(chr.px + chr.pw + CHR_GAP_PX);
    expect(right.pw).toBe(OTHERS_W);
  });

  test("perChrPxPerBp stretches the last chr slot and shifts trailing others by the deficit", () => {
    const specs: SlotSpec[] = [
      { kind: "chr", chr: "1A", bpLen: 100, p1: 0 },
      { kind: "others", baseChr: "1A", side: "right" },
    ];
    // chr width = 100*0.5 = 50. targetRight = 200 - 3 gap - 24 others = 173.
    // deficit = 123 → +123px width, +246bp (123/0.5) of bpLen, others slot shifts +123.
    const perChrPxPerBp = new Map([["1A", 0.5]]);
    const row = buildQueryRow(specs, "label", 200, perChrPxPerBp);
    const [chr, right] = row.slots;

    expect(chr.kind).toBe("chr");
    expect(chr.px).toBe(0);
    expect(chr.pw).toBe(173);
    if (chr.kind === "chr") {
      expect(chr.bpLen).toBe(346);
      expect(chr.dataBpLen).toBe(100);
    }

    expect(right.kind).toBe("others");
    expect(right.px).toBe(53 + 123);
    if (right.kind === "others") {
      expect(right.targetX).toBe(65 + 123);
    }
  });
});

describe("bpToPx", () => {
  const bar: ChrBar = { kind: "chr", chr: "1A", px: 50, pw: 200, bpLen: 1000, p1: 0 };

  test("returns the bar's start when bp matches its p1", () => {
    expect(bpToPx(bar, 0)).toBe(50);
  });

  test("returns the bar's end when bp matches its full extent", () => {
    expect(bpToPx(bar, 1000)).toBe(250);
  });

  test("interpolates linearly inside the bar", () => {
    expect(bpToPx(bar, 500)).toBe(150);
  });

  test("clamps below p1 and above p1 + bpLen", () => {
    expect(bpToPx(bar, -100)).toBe(50);
    expect(bpToPx(bar, 5000)).toBe(250);
  });
});

describe("ribbonPath", () => {
  test("produces an SVG path that starts with M, has both C segments, an L, and closes with Z", () => {
    const d = ribbonPath(0, 100, 0, 50, 150, 200);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/C /g)).toHaveLength(2);
    expect(d).toContain("L ");
  });

  test("expands collapsed endpoints to the requested minWidth", () => {
    const d = ribbonPath(100, 100, 0, 200, 200, 50, 10);
    expect(d).toContain("M 95");
    expect(d).toContain("195");
    expect(d).toContain("205");
  });
});

describe("computeRibbons", () => {
  const baseBar: ChrBar = { kind: "chr", chr: "1A", px: 0, pw: 200, bpLen: 200, p1: 0 };
  const queryBar: ChrBar = { kind: "chr", chr: "1A", px: 0, pw: 200, bpLen: 200, p1: 0 };
  const baseRow = { label: "base", bars: [baseBar], y: 10 };
  const queryRow = { label: "q", slots: [queryBar], y: 80 };

  test("maps each chunk's bp coordinates onto base and query slot pixels", () => {
    const chunk: Chunk = {
      ...makeChunk([1]),
      bp1Base: 50,
      bp2Base: 150,
      bp1Query: 50,
      bp2Query: 150,
    };
    const [ribbon] = computeRibbons([chunk], baseRow, queryRow, "hide");
    expect(ribbon.bxs).toBe(50);
    expect(ribbon.bxe).toBe(150);
    expect(ribbon.qxs).toBe(50);
    expect(ribbon.qxe).toBe(150);
  });

  test("swaps query endpoints when the chunk is inverted", () => {
    const chunk: Chunk = {
      ...makeChunk([1]),
      bp1Base: 50,
      bp2Base: 150,
      bp1Query: 50,
      bp2Query: 150,
      isInvert: true,
    };
    const [ribbon] = computeRibbons([chunk], baseRow, queryRow, "hide");
    expect(ribbon.qxs).toBe(150);
    expect(ribbon.qxe).toBe(50);
  });

  test("skips chunks whose base chromosome is not laid out", () => {
    const chunk: Chunk = { ...makeChunk([1]), chrBase: "missing" };
    expect(computeRibbons([chunk], baseRow, queryRow, "hide")).toEqual([]);
  });

  test("skips chunks whose query chromosome is not laid out and not grouped", () => {
    const chunk: Chunk = { ...makeChunk([1]), chrQuery: "missing" };
    expect(computeRibbons([chunk], baseRow, queryRow, "hide")).toEqual([]);
  });
});

describe("pct", () => {
  test("formats as a percentage with one decimal place", () => {
    expect(pct(1, 4)).toBe("25.0%");
    expect(pct(1, 3)).toBe("33.3%");
  });

  test("returns '0%' when the total is zero", () => {
    expect(pct(5, 0)).toBe("0%");
  });
});

describe("getPredictingLines", () => {
  test("returns the base prediction lines for unlisted chromosomes", () => {
    expect(getPredictingLines("ZZ")).toEqual(["paragon", "spelt"]);
  });

  test("appends per-chromosome extras", () => {
    expect(getPredictingLines("1A")).toEqual(["paragon", "spelt", "cs"]);
    expect(getPredictingLines("3B")).toEqual(["paragon", "spelt", "cs", "arina"]);
    expect(getPredictingLines("4B")).toEqual(["paragon", "spelt", "norin61", "landmark"]);
  });
});

describe("getPredictingRange", () => {
  test("falls back to mid=300 for unknown chromosomes", () => {
    expect(getPredictingRange("ZZ", "paragon")).toEqual({ lo: 270, hi: 330 });
  });

  test("centres on CHR_DEFAULT_MID when no override exists", () => {
    // 1A default mid = 210, half-window 30.
    expect(getPredictingRange("1A", "paragon")).toEqual({ lo: 180, hi: 240 });
  });

  test("numeric overrides shift the midpoint but keep the half-window", () => {
    // 4A cs override = 250.
    expect(getPredictingRange("4A", "cs")).toEqual({ lo: 220, hi: 280 });
  });

  test("object overrides replace the window verbatim", () => {
    expect(getPredictingRange("2B", "paragon")).toEqual({ lo: 355, hi: 365 });
  });
});

describe("findLargestGapCenter", () => {
  test("returns null when the range is invalid", () => {
    expect(findLargestGapCenter([], 10, 10)).toBeNull();
    expect(findLargestGapCenter([], 20, 10)).toBeNull();
  });

  test("returns the midpoint when there are no intervals", () => {
    expect(findLargestGapCenter([], 0, 100)).toBe(50);
  });

  test("returns null when intervals fully cover the range", () => {
    expect(findLargestGapCenter([[0, 100]], 0, 100)).toBeNull();
  });

  test("picks the midpoint of the largest gap", () => {
    expect(
      findLargestGapCenter(
        [
          [10, 30],
          [50, 70],
        ],
        0,
        100
      )
    ).toBe(85);
  });

  test("merges overlapping intervals before measuring gaps", () => {
    expect(
      findLargestGapCenter(
        [
          [10, 30],
          [20, 40],
        ],
        0,
        100
      )
    ).toBe(70);
  });

  test("clips intervals to the range so out-of-bounds endpoints don't shrink gaps", () => {
    expect(findLargestGapCenter([[-100, 10]], 0, 100)).toBe(55);
  });
});
