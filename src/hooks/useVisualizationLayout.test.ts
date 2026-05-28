import { renderHook } from "@testing-library/react";
import {
  applyGlobalExtension,
  buildTracks,
  computeGroupBounds,
  partitionTracksByChrSet,
  useVisualizationLayout,
  VisualizationLayout,
  type PairInput,
  type Track,
} from "@/src/hooks/useVisualizationLayout";
import type { IntraScoreConfig } from "@/src/components/visualizationTab/relabel";
import { CHROM_THICKNESS, OthersMode, PAD, RIBBON_GAP, ROW_GAP } from "@/src/constants";
import type { ChrBar } from "@/types";
import { makeChunk, makeRow, makeTranslocationRow } from "@/src/test/factories";

// Track with only chrOrder set (enough for partitioning).
const orderTrack = (chrOrder: string[]): Track => ({
  chrMin: new Map(),
  chrMax: new Map(),
  chrOrder,
  needsOthersStub: false,
});

// Track carrying per-chr bounds.
const boundsTrack = (mins: Record<string, number>, maxs: Record<string, number>): Track => ({
  chrMin: new Map(Object.entries(mins)),
  chrMax: new Map(Object.entries(maxs)),
  chrOrder: Object.keys(mins).sort(),
  needsOthersStub: false,
});

describe("buildTracks", () => {
  const baseChunk = makeChunk();

  it("populates the base track and the next track's query side from one pair", () => {
    const tracks = buildTracks([[baseChunk]], 1, "show");
    expect(tracks).toHaveLength(2);
    expect(tracks[0].chrMin.get("1A")).toBe(0);
    expect(tracks[0].chrMax.get("1A")).toBe(100);
    expect(tracks[0].chrOrder).toEqual(["1A"]);
    expect(tracks[1].chrMin.get("1A")).toBe(0);
    expect(tracks[1].chrMax.get("1A")).toBe(100);
  });

  it("threads chrs along the chain: base 1A -> middle {1A, 3D} -> final 1A", () => {
    const pair0 = [
      baseChunk,
      makeChunk({ bp1Base: 100, bp2Base: 200, bp1Query: 150, bp2Query: 250 }),
      makeChunk({ bp1Base: 200, bp2Base: 300, chrQuery: "3D" }),
    ];
    const pair1 = [
      makeChunk({ bp1Base: 200, bp2Base: 400, bp1Query: 10, bp2Query: 90 }),
      makeChunk({ chrBase: "3D", bp1Base: 50, bp2Base: 150, bp1Query: 200, bp2Query: 300 }),
    ];
    const [base, middle, final] = buildTracks([pair0, pair1], 2, "show");

    expect(base.chrOrder).toEqual(["1A"]);
    expect(base.chrMin.get("1A")).toBe(0);
    expect(base.chrMax.get("1A")).toBe(300);
    expect(base.chrMin.has("3D")).toBe(false);
    expect(middle.chrOrder).toEqual(["1A", "3D"]);
    expect(middle.chrMin.get("1A")).toBe(0);
    expect(middle.chrMax.get("1A")).toBe(400);
    expect(middle.chrMin.get("3D")).toBe(0);
    expect(middle.chrMax.get("3D")).toBe(150);
    expect(final.chrOrder).toEqual(["1A"]);
    expect(final.chrMin.get("1A")).toBe(10);
    expect(final.chrMax.get("1A")).toBe(300);
  });

  it("accumulates per-chr min/max across chunks and sorts chrOrder", () => {
    const pair = [
      makeChunk({ chrBase: "2B", chrQuery: "2B" }),
      makeChunk({ bp1Base: 50, bp2Base: 150, bp1Query: 10, bp2Query: 90 }),
      makeChunk({ bp1Base: 200, bp2Base: 300, bp1Query: 5, bp2Query: 95 }),
    ];
    const [baseTrack, queryTrack] = buildTracks([pair], 1, "show");

    expect(baseTrack.chrOrder).toEqual(["1A", "2B"]);
    expect(baseTrack.chrMin.get("1A")).toBe(50);
    expect(baseTrack.chrMax.get("1A")).toBe(300);
    expect(baseTrack.chrMin.get("2B")).toBe(0);
    expect(baseTrack.chrMax.get("2B")).toBe(100);
    expect(queryTrack.chrOrder).toEqual(["1A", "2B"]);
    expect(queryTrack.chrMin.get("1A")).toBe(5);
    expect(queryTrack.chrMax.get("1A")).toBe(95);
  });

  it("restricts later base chrs to those already present on the shared track", () => {
    const pair0 = [baseChunk];
    const pair1 = [
      makeChunk({ bp1Base: 200, bp2Base: 300, bp1Query: 200, bp2Query: 300 }),
      makeChunk({ chrBase: "2B", bp2Base: 50, bp1Query: 400, bp2Query: 450 }),
    ];
    const tracks = buildTracks([pair0, pair1], 2, "show");

    expect(tracks[1].chrOrder).toEqual(["1A"]);
    expect(tracks[1].chrMin.get("1A")).toBe(0);
    expect(tracks[1].chrMax.get("1A")).toBe(300);
    expect(tracks[1].chrMin.has("2B")).toBe(false);
  });

  it("routes grouped 'others' chunks to a stub instead of a query chr bound", () => {
    const pair = [baseChunk, makeChunk({ bp1Base: 100, bp2Base: 200, chrQuery: "rare", isOthers: true })];
    const tracks = buildTracks([pair], 1, "group");

    expect(tracks[1].needsOthersStub).toBe(true);
    expect(tracks[1].chrMin.has("rare")).toBe(false);
    expect(tracks[1].chrOrder).toEqual(["1A"]);
    expect(tracks[0].chrMax.get("1A")).toBe(100);
  });

  it("treats 'others' chunks as ordinary chromosomes when othersMode is 'show'", () => {
    const pair = [makeChunk({ chrQuery: "rare", bp1Query: 5, bp2Query: 80, isOthers: true })];
    const tracks = buildTracks([pair], 1, "show");

    expect(tracks[1].needsOthersStub).toBe(false);
    expect(tracks[1].chrMin.get("rare")).toBe(5);
  });
});

describe("partitionTracksByChrSet", () => {
  it("groups maximal runs of tracks with identical chr sets", () => {
    const tracks = [["1A"], ["1A"], ["1A", "2B"], ["1A", "2B"], ["1A"]].map(orderTrack);
    expect(partitionTracksByChrSet(tracks)).toEqual([0, 0, 1, 1, 2]);
  });

  it("compares chr sets order-independently", () => {
    expect(partitionTracksByChrSet([orderTrack(["1A", "2B"]), orderTrack(["2B", "1A"])])).toEqual([0, 0]);
  });

  it("returns a single group for one track", () => {
    expect(partitionTracksByChrSet([orderTrack(["1A"])])).toEqual([0]);
  });
});

describe("computeGroupBounds", () => {
  it("unifies min/max per chr within each group", () => {
    const tracks = [
      boundsTrack({ "1A": 10 }, { "1A": 100 }),
      boundsTrack({ "1A": 5 }, { "1A": 200 }),
      boundsTrack({ "2B": 0 }, { "2B": 50 }),
    ];
    const { groupChrMin, groupChrMax } = computeGroupBounds(tracks, [0, 0, 1]);

    expect(groupChrMin[0].get("1A")).toBe(5);
    expect(groupChrMax[0].get("1A")).toBe(200);
    expect(groupChrMin[1].get("2B")).toBe(0);
    expect(groupChrMax[1].get("2B")).toBe(50);
  });
});

describe("applyGlobalExtension", () => {
  const gMin = [new Map([["1A", 50]])];
  const unified = new Map([["1A", 10]]);

  it("extends to the global min when stripping is disabled (stripBlankBp <= 0)", () => {
    expect(applyGlobalExtension(gMin, unified, 0)[0].get("1A")).toBe(10);
  });

  it("extends to the global min when the leading blank is within the threshold", () => {
    expect(applyGlobalExtension(gMin, unified, 100)[0].get("1A")).toBe(10);
  });

  it("keeps the tighter group min when extending would open too wide a blank", () => {
    expect(applyGlobalExtension(gMin, unified, 20)[0].get("1A")).toBe(50);
  });

  it("keeps the group min for a chr absent from the unified axis", () => {
    expect(applyGlobalExtension([new Map([["2B", 5]])], unified, 0)[0].get("2B")).toBe(5);
  });
});

describe("useVisualizationLayout (end-to-end wiring)", () => {
  const defaultIntra: IntraScoreConfig = { minLocalEvents: 500, gapStopMbp: 10, driftK: 0.7, complexMin: 2 };

  interface Opts {
    baseLabel?: string;
    trackW?: number;
    gapBp?: number;
    othersMode?: OthersMode;
    hiddenThreshold?: number;
    commonIds?: Set<number>;
    commonOnly?: boolean;
    denoise?: boolean;
    sharedAxis?: boolean;
    stripBlankMbp?: number;
    intraRelabel?: boolean;
    intraScoreConfig?: IntraScoreConfig;
  }

  // Drive the hook once and return its layout array.
  const layout = (pairs: PairInput[], o: Opts = {}) =>
    renderHook(() =>
      useVisualizationLayout(
        pairs,
        o.baseLabel ?? "base",
        o.trackW ?? 1000,
        o.gapBp ?? 1_000_000,
        o.othersMode ?? "show",
        o.hiddenThreshold ?? 0,
        o.commonIds ?? new Set<number>(),
        o.commonOnly ?? false,
        o.denoise ?? false,
        o.sharedAxis ?? false,
        o.stripBlankMbp ?? 0,
        o.intraRelabel ?? false,
        o.intraScoreConfig ?? defaultIntra
      )
    ).result.current;

  // Synteny row at bp [id*100, (id+1)*100) on base and query - chain rows by id alone.
  const contiguous = (id: number) =>
    makeRow({ id, p1Base: id * 100, p2Base: (id + 1) * 100, p1Query: id * 100, p2Query: (id + 1) * 100 });

  const syntenyRows = [contiguous(0), contiguous(1)];

  // Two translocations to a rare chr, grouped as "others" - a chunk with isOthers === true.
  const othersRows = [
    makeTranslocationRow({
      id: 2,
      chromosomeQuery: "9Z",
      groupedQuery: "others",
      p1Base: 300,
      p2Base: 400,
    }),
    makeTranslocationRow({
      id: 3,
      chromosomeQuery: "9Z",
      groupedQuery: "others",
      p1Base: 400,
      p2Base: 500,
      p1Query: 100,
      p2Query: 200,
    }),
  ];

  const queryChrs = (l: VisualizationLayout) =>
    l.queryRow.slots.filter((s) => s.kind === "chr").map((s) => s.chr);

  it("builds one layout per pair with rows, slots, ribbons, and ribbon y-bounds", () => {
    const out = layout([{ queryLabel: "q1", data: syntenyRows }]);

    expect(out).toHaveLength(1);
    expect(out[0].baseRow.label).toBe("base");
    expect(out[0].baseRow.bars.map((b) => b.chr)).toEqual(["1A"]);
    expect(out[0].baseRow.bars[0].pw).toBeGreaterThan(0);
    expect(out[0].queryRow.label).toBe("q1");
    expect(queryChrs(out[0])).toEqual(["1A"]);
    expect(out[0].y1bot).toBe(PAD.top + CHROM_THICKNESS + RIBBON_GAP);
    expect(out[0].y2top).toBe(PAD.top + CHROM_THICKNESS + ROW_GAP - RIBBON_GAP);

    const r = out[0].ribbons[0];
    expect(out[0].ribbons).toHaveLength(1);
    expect(r.chunk.ids).toEqual([0, 1]);
    expect(r.chunk.dominant).toBe("synteny");
    expect([r.bxs, r.bxe, r.qxs, r.qxe].every((n) => Number.isFinite(n) && n >= 0)).toBe(true);
    expect(r.bxe).toBeGreaterThan(r.bxs);
    expect(r.qxe).toBeGreaterThan(r.qxs);
  });

  it("only the first pair carries the base label", () => {
    const pair1 = { queryLabel: "q1", data: syntenyRows };
    const pair2 = { queryLabel: "q2", data: syntenyRows };
    const out = layout([pair1, pair2], { baseLabel: "B" });

    expect(out).toHaveLength(2);
    expect(out[0].baseRow.label).toBe("B");
    expect(out[1].baseRow.label).toBe("");
  });

  it("drops chunks at or below hiddenThreshold", () => {
    const translocationRows = [
      makeTranslocationRow({ id: 2, p1Base: 300, p2Base: 400 }),
      makeTranslocationRow({ id: 3, p1Base: 500, p2Base: 600, p1Query: 200, p2Query: 300 }),
      makeTranslocationRow({ id: 4, p1Base: 700, p2Base: 800, p1Query: 400, p2Query: 500 }),
    ];
    // 2 and 3 events chunks
    const pairs = [{ queryLabel: "q1", data: [...syntenyRows, ...translocationRows] }];

    expect(layout(pairs, { hiddenThreshold: 1 })[0].ribbons).toHaveLength(2);
    const hidden = layout(pairs, { hiddenThreshold: 2 })[0];

    expect(hidden.ribbons).toHaveLength(1);
    expect(hidden.ribbons[0].chunk.dominant).toBe("translocation");
    expect(hidden.baseRow.bars).toHaveLength(1);
  });

  describe("commonOnly", () => {
    // pair1 ids {0,1,2}, pair2 ids {1,2,3} - intersection is {1,2}.
    const pairs = [
      { queryLabel: "q1", data: [contiguous(0), contiguous(1), contiguous(2)] },
      { queryLabel: "q2", data: [contiguous(1), contiguous(2), contiguous(3)] },
    ];

    it("restricts every pair to ids in commonIds when enabled", () => {
      const out = layout(pairs, { commonOnly: true, commonIds: new Set([1, 2]) });
      expect(out[0].ribbons[0].chunk.ids).toEqual([1, 2]);
      expect(out[1].ribbons[0].chunk.ids).toEqual([1, 2]);
    });

    it("ignores commonIds when disabled, keeping each pair's full id set", () => {
      const out = layout(pairs, { commonOnly: false, commonIds: new Set([1, 2]) });
      expect(out[0].ribbons[0].chunk.ids).toEqual([0, 1, 2]);
      expect(out[1].ribbons[0].chunk.ids).toEqual([1, 2, 3]);
    });

    it("does not filter when commonIds is empty", () => {
      const out = layout(pairs, { commonOnly: true, commonIds: new Set() });
      expect(out[0].ribbons[0].chunk.ids).toEqual([0, 1, 2]);
      expect(out[1].ribbons[0].chunk.ids).toEqual([1, 2, 3]);
    });
  });

  describe("denoise", () => {
    const pairs: PairInput[] = [
      { queryLabel: "q1", data: syntenyRows }, // ids {0, 1}
      { queryLabel: "q2", data: [makeRow()] }, // id {0}
    ];

    it("removes ids missing from any pair across every pair", () => {
      expect(layout(pairs, { denoise: true })[0].ribbons[0].chunk.ids).toEqual([0]);
    });

    it("keeps every id when disabled", () => {
      expect(layout(pairs, { denoise: false })[0].ribbons[0].chunk.ids).toEqual([0, 1]);
    });
  });

  describe("othersMode", () => {
    const pairs: PairInput[] = [{ queryLabel: "q1", data: [...syntenyRows, ...othersRows] }];

    it("'show' lays out the others chunk as an ordinary query chromosome", () => {
      const out = layout(pairs, { othersMode: "show" })[0];
      expect(out.ribbons).toHaveLength(2);
      expect(queryChrs(out)).toEqual(["1A", "9Z"]);
    });

    it("'hide' drops the others chunk entirely", () => {
      const out = layout(pairs, { othersMode: "hide" })[0];
      expect(out.ribbons).toHaveLength(1);
      expect(queryChrs(out)).toEqual(["1A"]);
    });

    it("'group' routes the others chunk to a stub instead of a query chr", () => {
      const out = layout(pairs, { othersMode: "group" })[0];
      expect(out.queryRow.slots.some((s) => s.kind === "others")).toBe(true);
      expect(queryChrs(out)).toEqual(["1A"]);
      expect(out.ribbons).toHaveLength(2);
    });
  });

  describe("sharedAxis", () => {
    // base Mbp: 1A=100, 2B=200, 2C=100
    // query Mbp: 1A=100, 2B=300, 2C=300
    const data = [
      makeRow(),
      makeRow({ id: 1, chromosomeBase: "2B", chromosomeQuery: "2B", p2Base: 200, p2Query: 300 }),
      makeRow({ id: 2, chromosomeBase: "2C", chromosomeQuery: "2C", p2Base: 100, p2Query: 300 }),
    ];
    const pairs: PairInput[] = [{ queryLabel: "q1", data }];

    const widthsOf = (l: VisualizationLayout, chrs: string[]) =>
      chrs.map((chr) => ({
        base: l.baseRow.bars.find((b) => b.chr === chr)!.pw,
        query: l.queryRow.slots.find((s): s is ChrBar => s.kind === "chr" && s.chr === chr)!.pw,
      }));
    const chrs = ["1A", "2B", "2C"];

    it("scales each row independently when off", () => {
      const [oneA, twoB, twoC] = widthsOf(layout(pairs, { sharedAxis: false })[0], chrs);
      expect(oneA.base).not.toBeCloseTo(oneA.query);
      expect(twoB.base).not.toBeCloseTo(twoB.query);
      expect(twoC.base).not.toBeCloseTo(twoC.query);
    });

    it("applies one global px/bp so shared chrs are equally wide across rows", () => {
      const [oneA, twoB, twoC] = widthsOf(layout(pairs, { sharedAxis: true })[0], chrs);
      expect(oneA.base).toBeCloseTo(oneA.query);
      expect(twoB.base).toBeCloseTo(twoB.query);
      expect(twoC.base).toBeCloseTo(twoC.query);
    });
  });

  describe("intraRelabel", () => {
    // Five single-row intra-chr chunks with q = [0, 1, 4, 2, 3]: idx2 is the stray
    // sandwiched between near-backbones, hard-labeled by the stray pre-filter.
    const mbp = 1_000_000;
    const intraRow = (id: number, baseM: number, queryM: number) =>
      makeRow({
        id,
        p1Base: baseM * mbp,
        p2Base: (baseM + 4) * mbp,
        p1Query: queryM * mbp,
        p2Query: (queryM + 4) * mbp,
      });

    const data = [
      intraRow(0, 0, 0),
      intraRow(1, 10, 10),
      intraRow(2, 20, 40),
      intraRow(3, 30, 20),
      intraRow(4, 40, 30),
    ];
    const pairs: PairInput[] = [{ queryLabel: "q1", data }];

    it("relabels the stray chunk to translocation without mutating its underlying data", () => {
      const off = layout(pairs, { intraRelabel: false })[0];
      const on = layout(pairs, { intraRelabel: true })[0];
      expect(on.ribbons[2].chunk.dominant).toBe("translocation");
      expect({ ...on.ribbons[2].chunk, dominant: "synteny" }).toEqual(off.ribbons[2].chunk);
    });

    it("leaves all chunks as synteny when disabled", () => {
      const out = layout(pairs, { intraRelabel: false })[0];
      expect(out.ribbons.map((r) => r.chunk.dominant)).toEqual(Array(5).fill("synteny"));
    });
  });

  it("memoizes the layout when nothing changes and rebuilds when an input does", () => {
    const pairs: PairInput[] = [{ queryLabel: "q1", data: syntenyRows }];
    const commonIds = new Set<number>();
    const { result, rerender } = renderHook(
      ({ trackW }) =>
        useVisualizationLayout(
          pairs,
          "base",
          trackW,
          1e6,
          "show",
          0,
          commonIds,
          false,
          false,
          false,
          0,
          false,
          defaultIntra
        ),
      { initialProps: { trackW: 1000 } }
    );
    const first = result.current;

    rerender({ trackW: 1000 });
    expect(result.current).toBe(first);

    rerender({ trackW: 999 });
    expect(result.current).not.toBe(first);
  });
});
