import {
  applyGlobalExtension,
  buildTracks,
  computeGroupBounds,
  partitionTracksByChrSet,
  type Track,
} from "@/src/hooks/useVisualizationLayout";
import { makeChunk } from "@/src/test/factories";

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
