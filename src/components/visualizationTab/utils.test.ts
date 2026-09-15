import type { SlotSpec } from "@/src/components/visualizationTab/utils";
import {
  bpToPx,
  buildBaseRow,
  buildChunk,
  buildQueryRow,
  chunkRows,
  collectNoisyIds,
  collectTicks,
  computeRibbons,
  findLargestGapCenter,
  formatBpLabel,
  getPredictingLines,
  getPredictingRange,
  niceTickStep,
  pct,
  resolveTickStepBp,
  ribbonPath,
  rowCategory,
  zeroCounts,
} from "@/src/components/visualizationTab/utils";
import { CHR_GAP_PX, CHROM_THICKNESS, DEFAULT_TICK_STEP_BP, OTHERS_W, PAD, ROW_GAP } from "@/src/constants";
import type { ChrBar, Chunk, OthersBar, ResultRow } from "@/types";
import {
  counts,
  makeChunk as baseChunk,
  makeInversionRow,
  makeRow,
  makeTranslocationRow,
} from "@/src/test/factories";

const EMPTY_SET = new Set();

// Chunk keyed by its row ids, with event counts and query-chr counts derived from them.
const makeChunk = (ids: number[]): Chunk =>
  baseChunk({
    ids,
    eventCounts: counts({ synteny: ids.length, total: ids.length }),
    queryChromCounts: { "1A": ids.length },
  });

describe("rowCategory", () => {
  it("returns the event matching the row's flags", () => {
    expect(rowCategory(makeRow())).toBe("synteny");
    expect(rowCategory(makeInversionRow())).toBe("inversion");

    const translocation = makeTranslocationRow({ chromosomeQuery: "2B" });
    expect(rowCategory(translocation)).toBe("translocation");
    expect(rowCategory({ ...translocation, isInvert: true })).toBe("translocation+inversion");
  });
});

describe("zeroCounts", () => {
  it("zeroCounts initialises every key to 0", () => {
    expect(zeroCounts()).toEqual({
      synteny: 0,
      inversion: 0,
      translocation: 0,
      "translocation+inversion": 0,
      total: 0,
    });
  });
});

describe("collectNoisyIds", () => {
  it("returns an empty set when there is at most one pair", () => {
    expect(collectNoisyIds([])).toEqual(EMPTY_SET);
    expect(collectNoisyIds([[makeChunk([1, 2])]])).toEqual(EMPTY_SET);
  });

  it("flags ids missing from at least one pair", () => {
    const chunksPair1 = [makeChunk([1, 2, 3])];
    const chunksPair2 = [makeChunk([2, 3, 4])];
    expect(collectNoisyIds([chunksPair1, chunksPair2])).toEqual(new Set([1, 4]));
  });

  it("returns an empty set when every id appears in every pair", () => {
    const chunks = [makeChunk([1, 2, 3])];
    expect(collectNoisyIds([chunks, [makeChunk([3, 2, 1])]])).toEqual(EMPTY_SET);
  });
});

describe("buildChunk", () => {
  it("aggregates ids, bp ranges, and event counts", () => {
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

  it("picks the dominant query chromosome by count", () => {
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

  it("marks isInvert when the dominant query rows are mostly inverted", () => {
    const rows: ResultRow[] = [makeInversionRow({ id: 1 }), makeInversionRow({ id: 2 }), makeRow({ id: 3 })];
    const chunk = buildChunk(rows, 0, "lineA");
    expect(chunk.isInvert).toBe(true);
  });

  it("marks isOthers when most rows are grouped as 'others'", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, chromosomeQuery: "rare1", groupedQuery: "others" }),
      makeRow({ id: 2, chromosomeQuery: "rare2", groupedQuery: "others" }),
      makeRow({ id: 3, chromosomeQuery: "1A", groupedQuery: "1A" }),
    ];
    const chunk = buildChunk(rows, 0, "lineA");
    expect(chunk.isOthers).toBe(true);
  });

  it("dominant ties resolve to whichever event reached the max first in row order", () => {
    const synteny = () => makeRow({ id: 0 });
    const inversion = () => makeInversionRow({ id: 0 });

    const syntenyFirst = [synteny(), synteny(), synteny(), inversion(), inversion(), inversion()];
    expect(buildChunk(syntenyFirst, 0, "lineA").dominant).toBe("synteny");

    const inversionFirst = [inversion(), inversion(), inversion(), synteny(), synteny(), synteny()];
    expect(buildChunk(inversionFirst, 0, "lineA").dominant).toBe("inversion");
  });

  it("non-synteny rows don't extend the query bp range when synteny dominates", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Query: 0, p2Query: 100 }),
      makeRow({ id: 2, p1Query: 100, p2Query: 200 }),
      makeRow({ id: 3, p1Query: 200, p2Query: 300 }),
      // dominant stays "synteny" (3 vs 1); this row's query range is excluded.
      makeInversionRow({ id: 4, p1Query: 1000, p2Query: 2000 }),
    ];
    const chunk = buildChunk(rows, 0, "lineA");
    expect(chunk.dominant).toBe("synteny");
    expect(chunk.bp1Query).toBe(0);
    expect(chunk.bp2Query).toBe(300);
  });
});

describe("chunkRows", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkRows([], 100, "lineA")).toEqual([]);
  });

  it("keeps rows together when the base gap is within gapBp", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Base: 0, p2Base: 100, p1Query: 0, p2Query: 100 }),
      makeRow({ id: 2, p1Base: 110, p2Base: 200, p1Query: 110, p2Query: 200 }),
    ];
    const chunks = chunkRows(rows, 50, "lineA");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].ids).toEqual([1, 2]);
  });

  it("splits rows where the base gap exceeds gapBp", () => {
    const rows: ResultRow[] = [
      makeRow({ id: 1, p1Base: 0, p2Base: 100, p1Query: 0, p2Query: 100 }),
      makeRow({ id: 2, p1Base: 1000, p2Base: 1100, p1Query: 1000, p2Query: 1100 }),
    ];
    const chunks = chunkRows(rows, 50, "lineA");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].ids).toEqual([1]);
    expect(chunks[1].ids).toEqual([2]);
  });

  it("keeps non-translocation and translocation rows in separate chunks", () => {
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

  it("strict mode splits when the query span is disproportional to the base span", () => {
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

  it("strict mode splits non-inverted rows whose query lies before the chunk start", () => {
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

  it("translocation 'others' rows use non-strict sweep and stay together despite skewed query spans", () => {
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
  it("returns no bars when chrOrder is empty", () => {
    const row = buildBaseRow(new Map(), new Map(), [], "label", 500, "hide");
    expect(row).toEqual({ label: "label", bars: [], y: PAD.top });
  });

  it("places bars consecutively with the configured gap between them", () => {
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

  it("reserves an 'others' stub on the left when othersMode is 'group'", () => {
    const chrMax = new Map([["1A", 100]]);
    const chrMin = new Map([["1A", 0]]);
    const row = buildBaseRow(chrMax, chrMin, ["1A"], "label", 500, "group");
    expect(row.bars[0].px).toBe(OTHERS_W + CHR_GAP_PX);
  });

  it("perChrPxPerBp overrides rowPxPerBp per chr and leaves the row short of availW", () => {
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

    // the last bar keeps its data extent, so the row ends 50px short of availW.
    expect(row.bars[1].pw).toBe(100);
    expect(row.bars[1].bpLen).toBe(100);
    expect(row.bars[1].px + row.bars[1].pw).toBe(153);
  });
});

describe("buildQueryRow", () => {
  it("returns no slots when slotSpecs is empty", () => {
    const row = buildQueryRow([], "label", 200);
    expect(row).toEqual({
      label: "label",
      slots: [],
      y: PAD.top + CHROM_THICKNESS + ROW_GAP,
    });
  });

  it("lays out chr and others slots back-to-back with the configured gap", () => {
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

  it("perChrPxPerBp sizes the chr slot from its own extent, leaving the row short", () => {
    const specs: SlotSpec[] = [
      { kind: "chr", chr: "1A", bpLen: 100, p1: 0 },
      { kind: "others", baseChr: "1A", side: "right" },
    ];
    // chr width = 100*0.5 = 50, so the row ends at 50 + 3 gap + 24 others = 77 of availW 200.
    const perChrPxPerBp = new Map([["1A", 0.5]]);
    const row = buildQueryRow(specs, "label", 200, perChrPxPerBp);
    const [chr, right] = row.slots;
    if (chr.kind !== "chr" || right.kind !== "others") throw new Error("unexpected slot kinds");

    expect(chr.px).toBe(0);
    expect(chr.pw).toBe(50);
    expect(chr.bpLen).toBe(100);
    expect(right.px).toBe(53);
    expect(right.targetX).toBe(65);
  });
});

describe("niceTickStep", () => {
  it("snaps up to the next 1 / 2 / 2.5 / 5 / 10 multiple", () => {
    expect(niceTickStep(1e6)).toBe(1e6);
    expect(niceTickStep(1.4e6)).toBe(2e6);
    expect(niceTickStep(2.1e6)).toBe(2.5e6);
    expect(niceTickStep(3e6)).toBe(5e6);
    expect(niceTickStep(6e6)).toBe(1e7);
  });
});

describe("resolveTickStepBp", () => {
  const bar = (pw: number, bpLen: number): ChrBar => ({ kind: "chr", chr: "1A", px: 0, pw, bpLen, p1: 0 });

  it("returns the manual interval in bp when one is set", () => {
    expect(resolveTickStepBp([bar(100, 1e9)], 10, 25)).toBe(2.5e7);
  });

  it("picks a step around the target spacing from the tightest bar", () => {
    // 800px / 200Mbp = 4e-6 px/bp; an 80px target wants 20Mbp, which snaps to 20Mbp.
    expect(resolveTickStepBp([bar(800, 2e8), bar(800, 1e8)], 10, 0)).toBe(2e7);
  });

  it("caps ticks per chromosome once a bar is wide enough for the spacing rule alone", () => {
    // 8000px / 200Mbp leaves the 80px target wanting 2Mbp (100 ticks); the cap lifts it to 20Mbp.
    expect(resolveTickStepBp([bar(8000, 2e8)], 10, 0)).toBe(2e7);
  });

  it("scales the target spacing with font size", () => {
    // 7em at font 30 beats the 80px floor: a 210px target wants 52.5Mbp, snapped to 100Mbp.
    expect(resolveTickStepBp([bar(800, 2e8)], 30, 0)).toBe(1e8);
  });

  it("falls back to the default step when no bar has a usable extent", () => {
    expect(resolveTickStepBp([], 10, 0)).toBe(DEFAULT_TICK_STEP_BP);
    expect(resolveTickStepBp([bar(0, 1e8), bar(100, 0)], 10, 0)).toBe(DEFAULT_TICK_STEP_BP);
  });
});

describe("formatBpLabel", () => {
  it("picks the unit from the value and trims trailing zeros", () => {
    expect(formatBpLabel(5e5)).toBe("500k");
    expect(formatBpLabel(1e6)).toBe("1M");
    expect(formatBpLabel(1.5e6)).toBe("1.5M");
    expect(formatBpLabel(2.5e6)).toBe("2.5M");
    expect(formatBpLabel(1e8)).toBe("100M");
    expect(formatBpLabel(1.1e9)).toBe("1.1G");
  });

  it("renders sub-kbp values as plain bp", () => {
    expect(formatBpLabel(0)).toBe("0");
    expect(formatBpLabel(250)).toBe("250");
  });
});

describe("collectTicks", () => {
  const bar = (chr: string, px: number, pw: number, p1: number, bpLen: number): ChrBar => ({
    kind: "chr",
    chr,
    px,
    pw,
    bpLen,
    p1,
  });
  const byKey = (ticks: ReturnType<typeof collectTicks>) => new Map(ticks.map((t) => [t.key, t]));

  it("pairs a bp present on both rows and connects it", () => {
    const ticks = collectTicks([bar("1A", 0, 200, 0, 2e8)], [bar("1A", 0, 200, 0, 2e8)], 1e8, true);

    expect(ticks.map((t) => t.key)).toEqual(["1A-0", "1A-100000000", "1A-200000000"]);
    expect(ticks.every((t) => t.drawLine)).toBe(true);
    expect(byKey(ticks).get("1A-100000000")).toMatchObject({ xTop: 100, xBottom: 100 });
  });

  it("emits a one-sided tick for a bp past the other row's bar, and for a chr it lacks", () => {
    const ticks = collectTicks(
      [bar("1A", 0, 200, 0, 2e8)],
      [bar("1A", 0, 100, 0, 1e8), bar("2B", 103, 100, 0, 1e8)],
      1e8,
      true
    );
    const found = byKey(ticks);

    // 200M is past the query bar's end, so it keeps a top x only.
    expect(found.get("1A-200000000")).toMatchObject({ xTop: 200, xBottom: undefined, drawLine: false });
    // 2B is missing from the base row, so its ticks carry a bottom x only.
    expect(found.get("2B-0")).toMatchObject({ xBottom: 103, drawLine: false });
    expect(found.get("2B-100000000")).toMatchObject({ xBottom: 203 });
    expect(found.get("2B-0")?.xTop).toBeUndefined();
  });

  it("suppresses every connector when the rows are not on one scale", () => {
    const ticks = collectTicks([bar("1A", 0, 200, 0, 2e8)], [bar("1A", 0, 200, 0, 2e8)], 1e8, false);

    expect(ticks.every((t) => t.drawLine)).toBe(false);
    expect(ticks.every((t) => t.xTop !== undefined && t.xBottom !== undefined)).toBe(true);
  });

  it("suppresses a connector whose two ends drift too far apart", () => {
    // the query bar starts 60px right of the base bar: 60 / 200 is well past MAX_TICK_OFFSET_FRAC.
    const ticks = collectTicks([bar("1A", 0, 200, 0, 2e8)], [bar("1A", 60, 200, 0, 2e8)], 1e8, true);

    expect(ticks.every((t) => t.drawLine)).toBe(false);
  });

  it("starts at the first step multiple inside the bar, not at its p1", () => {
    const ticks = collectTicks([bar("1A", 0, 200, 1.2e8, 2e8)], [], 1e8, true);

    expect(ticks.map((t) => t.label)).toEqual(["200M", "300M"]);
  });
});

describe("bpToPx", () => {
  const bar: ChrBar = { kind: "chr", chr: "1A", px: 50, pw: 200, bpLen: 1000, p1: 0 };

  it("returns the bar's start when bp matches its p1", () => {
    expect(bpToPx(bar, 0)).toBe(50);
  });

  it("returns the bar's end when bp matches its full extent", () => {
    expect(bpToPx(bar, 1000)).toBe(250);
  });

  it("interpolates linearly inside the bar", () => {
    expect(bpToPx(bar, 500)).toBe(150);
  });

  it("clamps below p1 and above p1 + bpLen", () => {
    expect(bpToPx(bar, -100)).toBe(50);
    expect(bpToPx(bar, 5000)).toBe(250);
  });
});

describe("ribbonPath", () => {
  it("produces an SVG path that starts with M, has both C segments, an L, and closes with Z", () => {
    const d = ribbonPath(0, 100, 0, 50, 150, 200);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/C /g)).toHaveLength(2);
    expect(d).toContain("L ");
  });

  it("expands collapsed endpoints to the requested minWidth", () => {
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

  it("maps each chunk's bp coordinates onto base and query slot pixels", () => {
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

  it("swaps query endpoints when the chunk is inverted", () => {
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

  it("skips chunks whose base chromosome is not laid out", () => {
    const chunk: Chunk = { ...makeChunk([1]), chrBase: "missing" };
    expect(computeRibbons([chunk], baseRow, queryRow, "hide")).toEqual([]);
  });

  it("skips chunks whose query chromosome is not laid out and not grouped", () => {
    const chunk: Chunk = { ...makeChunk([1]), chrQuery: "missing" };
    expect(computeRibbons([chunk], baseRow, queryRow, "hide")).toEqual([]);
  });

  const rightStub: OthersBar = {
    kind: "others",
    baseChr: "1A",
    side: "right",
    px: 176,
    pw: OTHERS_W,
    targetX: 188,
  };

  it("routes a grouped 'others' chunk to the stub on the side its base midpoint favours", () => {
    const leftStub: OthersBar = {
      kind: "others",
      baseChr: "1A",
      side: "left",
      px: 0,
      pw: OTHERS_W,
      targetX: 12,
    };
    const groupedRow = { label: "q", slots: [leftStub, rightStub], y: 80 };

    // base midpoint 10 <= barMid 100 → left stub; halfW = min(span/2=10, OTHERS_W/2=12) = 10.
    const left: Chunk = { ...makeChunk([1]), bp1Base: 0, bp2Base: 20, isOthers: true };
    const [leftRibbon] = computeRibbons([left], baseRow, groupedRow, "group");
    expect(leftRibbon).toMatchObject({ bxs: 0, bxe: 20, qxs: 2, qxe: 22 });

    // base midpoint 190 > barMid 100 → right stub.
    const right: Chunk = { ...makeChunk([2]), bp1Base: 180, bp2Base: 200, isOthers: true };
    const [rightRibbon] = computeRibbons([right], baseRow, groupedRow, "group");
    expect(rightRibbon).toMatchObject({ bxs: 180, bxe: 200, qxs: 178, qxe: 198 });
  });

  it("skips a grouped 'others' chunk when its favoured stub is absent", () => {
    const rightOnly = {
      label: "q",
      slots: [rightStub],
      y: 80,
    };
    const left: Chunk = { ...makeChunk([1]), bp1Base: 0, bp2Base: 20, isOthers: true };
    expect(computeRibbons([left], baseRow, rightOnly, "group")).toEqual([]);
  });
});

describe("pct", () => {
  it("formats as a percentage with one decimal place", () => {
    expect(pct(1, 4)).toBe("25.0%");
    expect(pct(1, 3)).toBe("33.3%");
  });

  it("returns '0%' when the total is zero", () => {
    expect(pct(5, 0)).toBe("0%");
  });
});

describe("getPredictingLines", () => {
  it("returns the base prediction lines for unlisted chromosomes", () => {
    expect(getPredictingLines("ZZ")).toEqual(["paragon", "spelt"]);
  });

  it("appends per-chromosome extras", () => {
    expect(getPredictingLines("1A")).toEqual(["paragon", "spelt", "cs"]);
    expect(getPredictingLines("3B")).toEqual(["paragon", "spelt", "cs", "arina"]);
    expect(getPredictingLines("4B")).toEqual(["paragon", "spelt", "norin61", "landmark"]);
  });
});

describe("getPredictingRange", () => {
  it("falls back to mid=300 for unknown chromosomes", () => {
    expect(getPredictingRange("ZZ", "paragon")).toEqual({ lo: 270, hi: 330 });
  });

  it("centres on CHR_DEFAULT_MID when no override exists", () => {
    // 1A default mid = 210, half-window 30.
    expect(getPredictingRange("1A", "paragon")).toEqual({ lo: 180, hi: 240 });
  });

  it("numeric overrides shift the midpoint but keep the half-window", () => {
    // 4A cs override = 250.
    expect(getPredictingRange("4A", "cs")).toEqual({ lo: 220, hi: 280 });
  });

  it("object overrides replace the window verbatim", () => {
    expect(getPredictingRange("2B", "paragon")).toEqual({ lo: 355, hi: 365 });
  });
});

describe("findLargestGapCenter", () => {
  it("returns null when the range is invalid", () => {
    expect(findLargestGapCenter([], 10, 10)).toBeNull();
    expect(findLargestGapCenter([], 20, 10)).toBeNull();
  });

  it("returns the midpoint when there are no intervals", () => {
    expect(findLargestGapCenter([], 0, 100)).toBe(50);
  });

  it("returns null when intervals fully cover the range", () => {
    expect(findLargestGapCenter([[0, 100]], 0, 100)).toBeNull();
  });

  it("picks the midpoint of the largest gap", () => {
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

  it("merges overlapping intervals before measuring gaps", () => {
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

  it("clips intervals to the range so out-of-bounds endpoints don't shrink gaps", () => {
    expect(findLargestGapCenter([[-100, 10]], 0, 100)).toBe(55);
  });
});
