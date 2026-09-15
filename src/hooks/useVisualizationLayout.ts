import { useMemo } from "react";
import type { ResultRow } from "@/types";
import type { OthersMode } from "@/src/constants";
import { CHR_GAP_PX, CHROM_THICKNESS, RIBBON_GAP } from "@/src/constants";
import type { BaseRow, Chunk, ChunkRibbon, QueryRow } from "@/types";
import type { SlotSpec } from "@/src/components/visualizationTab/utils";
import {
  buildBaseRow,
  buildQueryRow,
  chunkRows,
  collectNoisyIds,
  computeRibbons,
} from "@/src/components/visualizationTab/utils";
import type { IntraScoreConfig } from "@/src/components/visualizationTab/relabel";
import { relabelIntraChunks } from "@/src/components/visualizationTab/relabel";

export interface VisualizationLayout {
  baseRow: BaseRow;
  queryRow: QueryRow;
  ribbons: ChunkRibbon[];
  y1bot: number;
  y2top: number;
}

export interface PairInput {
  data: ResultRow[];
  queryLabel: string;
}

export interface Track {
  chrMax: Map<string, number>;
  chrMin: Map<string, number>;
  chrOrder: string[];
  needsOthersStub: boolean;
}

// Tracks: 0..N. Track i is the row shared by pair (i-1)'s query side and pair i's base side.
// Each pair p contributes chrBase to track p and chrQuery to track p+1 in a single pass.
// The pair-major order ensures track p's chrQuery side (from pair p-1) is populated before
// pair p's chrBase contribution checks the restrict set.
export const buildTracks = (cleanChunksPerPair: Chunk[][], pairCount: number, othersMode: OthersMode) => {
  const out: Track[] = [];
  for (let i = 0; i < pairCount + 1; i++) {
    out.push({ chrMax: new Map(), chrMin: new Map(), chrOrder: [], needsOthersStub: false });
  }

  for (let p = 0; p < pairCount; p++) {
    const baseTrack = out[p];
    const queryTrack = out[p + 1];
    const restrictBase = p > 0;

    for (const c of cleanChunksPerPair[p]) {
      const isHidden = othersMode !== "show" && c.isOthers;

      if (!isHidden && (!restrictBase || baseTrack.chrMin.has(c.chrBase))) {
        const minCur = baseTrack.chrMin.get(c.chrBase);
        if (minCur === undefined || c.bp1Base < minCur) baseTrack.chrMin.set(c.chrBase, c.bp1Base);
        const maxCur = baseTrack.chrMax.get(c.chrBase);
        if (maxCur === undefined || c.bp2Base > maxCur) baseTrack.chrMax.set(c.chrBase, c.bp2Base);
      }

      if (othersMode === "group" && c.isOthers) {
        queryTrack.needsOthersStub = true;
      } else if (!isHidden) {
        const minCur = queryTrack.chrMin.get(c.chrQuery);
        if (minCur === undefined || c.bp1Query < minCur) queryTrack.chrMin.set(c.chrQuery, c.bp1Query);
        const maxCur = queryTrack.chrMax.get(c.chrQuery);
        if (maxCur === undefined || c.bp2Query > maxCur) queryTrack.chrMax.set(c.chrQuery, c.bp2Query);
      }
    }
  }

  for (const t of out) t.chrOrder = Array.from(t.chrMin.keys()).sort();
  return out;
};

// Partition tracks into maximal runs of consecutive tracks whose chr sets are identical.
// Returns groupOf[i] = group index for track i.
export const partitionTracksByChrSet = (tracks: Track[]): number[] => {
  const sameSet = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sb = new Set(b);
    return a.every((c) => sb.has(c));
  };

  const groupOf: number[] = [0];
  for (let i = 1; i < tracks.length; i++) {
    if (sameSet(tracks[i - 1].chrOrder, tracks[i].chrOrder)) {
      groupOf.push(groupOf[i - 1]);
    } else {
      groupOf.push(groupOf[i - 1] + 1);
    }
  }
  return groupOf;
};

// Within each group, unify per-chr min/max so every track in the group shares the same axis.
export const computeGroupBounds = (tracks: Track[], groupOf: number[]) => {
  const groupCount = (groupOf[tracks.length - 1] ?? -1) + 1;
  const groupChrMin: Map<string, number>[] = Array.from({ length: groupCount }, () => new Map());
  const groupChrMax: Map<string, number>[] = Array.from({ length: groupCount }, () => new Map());
  for (let i = 0; i < tracks.length; i++) {
    const g = groupOf[i];
    tracks[i].chrMin.forEach((v, chr) => {
      const cur = groupChrMin[g].get(chr);
      if (cur === undefined || v < cur) groupChrMin[g].set(chr, v);
    });
    tracks[i].chrMax.forEach((v, chr) => {
      const cur = groupChrMax[g].get(chr);
      if (cur === undefined || v > cur) groupChrMax[g].set(chr, v);
    });
  }
  return { groupChrMin, groupChrMax };
};

// Extend each group's chrMin out to the global unified min, unless that extension would
// create a leading blank wider than stripBlankBp (in which case the tighter group-min stays).
export const applyGlobalExtension = (
  groupChrMin: Map<string, number>[],
  unifiedChrMin: Map<string, number>,
  stripBlankBp: number
) =>
  groupChrMin.map((gMin) => {
    const cmin = new Map<string, number>();
    gMin.forEach((v, chr) => {
      const u = unifiedChrMin.get(chr);
      if (u !== undefined && (stripBlankBp <= 0 || v - u <= stripBlankBp)) {
        cmin.set(chr, u);
      } else {
        cmin.set(chr, v);
      }
    });
    return cmin;
  });

export const computeVisualizationLayout = (
  pairs: PairInput[],
  baseLabel: string,
  trackW: number,
  gapBp: number,
  othersMode: OthersMode,
  hiddenThreshold: number,
  commonIds: Set<number>,
  commonOnly: boolean,
  denoise: boolean,
  sharedAxis: boolean,
  stripBlankMbp: number,
  intraRelabel: boolean,
  intraScoreConfig: IntraScoreConfig
): VisualizationLayout[] => {
  const stripBlankBp = stripBlankMbp > 0 ? stripBlankMbp * 1e6 : 0;

  const filteredData: ResultRow[][] = (() => {
    const data = pairs.map((p) => p.data);
    if (commonOnly && commonIds.size) {
      return data.map((rows) => rows.filter((r) => commonIds.has(r.id)));
    }
    return data;
  })();

  const buildPair = (rows: ResultRow[], queryLabel: string): Chunk[] => {
    const byChr = new Map<string, ResultRow[]>();
    for (const r of rows) {
      let arr = byChr.get(r.chromosomeBase);
      if (!arr) {
        arr = [];
        byChr.set(r.chromosomeBase, arr);
      }
      arr.push(r);
    }
    const all: Chunk[] = [];
    byChr.forEach((rs) =>
      all.push(
        ...chunkRows(
          rs.sort((a, b) => a.p1Base - b.p1Base),
          gapBp,
          queryLabel
        ).filter((c) => c.eventCounts.total > hiddenThreshold)
      )
    );
    return all;
  };

  let chunksPerPair = pairs.map((p, i) => buildPair(filteredData[i], p.queryLabel));
  if (denoise) {
    const noisy = collectNoisyIds(chunksPerPair);
    if (noisy.size) {
      chunksPerPair = pairs.map((p, i) =>
        buildPair(
          filteredData[i].filter((r) => !noisy.has(r.id)),
          p.queryLabel
        )
      );
    }
  }

  const cleanChunksPerPair: Chunk[][] =
    othersMode === "hide" ? chunksPerPair.map((cs) => cs.filter((c) => !c.isOthers)) : chunksPerPair;

  const { minLocalEvents, gapStopMbp, driftK, complexMin } = intraScoreConfig;
  const relabeledChunksPerPair: Chunk[][] = !intraRelabel
    ? cleanChunksPerPair
    : cleanChunksPerPair.map((cs) =>
        relabelIntraChunks(cs, intraRelabel, { minLocalEvents, gapStopMbp, driftK, complexMin })
      );

  const tracks = buildTracks(cleanChunksPerPair, pairs.length, othersMode);

  const unifiedAxis = (() => {
    const chrMin = new Map<string, number>();
    const chrMax = new Map<string, number>();
    for (const t of tracks) {
      t.chrMin.forEach((v, chr) => {
        const cur = chrMin.get(chr);
        if (cur === undefined || v < cur) chrMin.set(chr, v);
      });
      t.chrMax.forEach((v, chr) => {
        const cur = chrMax.get(chr);
        if (cur === undefined || v > cur) chrMax.set(chr, v);
      });
    }
    const chrOrder = Array.from(chrMin.keys()).sort();
    const needsOthersStub = tracks.some((t) => t.needsOthersStub);
    return { chrMin, chrMax, chrOrder, needsOthersStub };
  })();

  // Per-pair axes under shared-axis: partition tracks into groups of identical chr sets,
  // unify bounds within each group, then extend chrMin out to the global unified min unless
  // stripBlankBp would cut a leading blank. chrMax stays at group-max.
  const finalAxes: Track[] = (() => {
    if (!sharedAxis) return tracks;

    const groupOf = partitionTracksByChrSet(tracks);
    const { groupChrMin, groupChrMax } = computeGroupBounds(tracks, groupOf);
    const groupFinalChrMin = applyGlobalExtension(groupChrMin, unifiedAxis.chrMin, stripBlankBp);

    return tracks.map((t, i) => ({
      chrMin: groupFinalChrMin[groupOf[i]],
      chrMax: groupChrMax[groupOf[i]],
      chrOrder: t.chrOrder,
      needsOthersStub: t.needsOthersStub,
    }));
  })();

  const pairAxes = pairs.map((_, p) => ({ baseAxis: finalAxes[p], queryAxis: finalAxes[p + 1] }));

  // One px/bp per track, from that track's own axis. Tracks with the same chr set share bounds and
  // so land on the same ratio, keeping their bars aligned; a track whose chr set differs takes its
  // own ratio and fills trackW rather than ending short of it.
  const trackPxPerBp: (Map<string, number> | undefined)[] = finalAxes.map((axis) => {
    if (!sharedAxis) return undefined;
    const n = axis.chrOrder.length;
    if (!n) return undefined;
    let totalBp = 0;
    for (const chr of axis.chrOrder) {
      totalBp += (axis.chrMax.get(chr) ?? 0) - (axis.chrMin.get(chr) ?? 0);
    }
    if (totalBp <= 0) return undefined;
    const pxPerBp = (trackW - (n - 1) * CHR_GAP_PX) / totalBp;
    return new Map(axis.chrOrder.map((chr) => [chr, pxPerBp]));
  });

  return pairs.map((pair, p) => {
    const { baseAxis, queryAxis } = pairAxes[p];

    const baseRow = buildBaseRow(
      baseAxis.chrMax,
      baseAxis.chrMin,
      baseAxis.chrOrder,
      p === 0 ? baseLabel : "",
      trackW,
      othersMode,
      trackPxPerBp[p]
    );

    const chrSpecs: SlotSpec[] = queryAxis.chrOrder.map((chr) => {
      const p1 = queryAxis.chrMin.get(chr) ?? 0;
      const bpLen = Math.max(queryAxis.chrMax.get(chr) ?? 1, 1) - p1;
      return { kind: "chr", chr, p1, bpLen };
    });

    const specs: SlotSpec[] = [];
    const showOthersStubs = othersMode === "group" && queryAxis.needsOthersStub;
    if (showOthersStubs) specs.push({ kind: "others", baseChr: "__others__", side: "left" });
    specs.push(...chrSpecs);
    if (showOthersStubs) specs.push({ kind: "others", baseChr: "__others__", side: "right" });

    const queryRow = buildQueryRow(specs, pair.queryLabel, trackW, trackPxPerBp[p + 1]);

    const ribbons = computeRibbons(relabeledChunksPerPair[p], baseRow, queryRow, othersMode);
    const y1bot = baseRow.y + CHROM_THICKNESS + RIBBON_GAP;
    const y2top = queryRow.y - RIBBON_GAP;

    return { baseRow, queryRow, ribbons, y1bot, y2top };
  });
};

export const useVisualizationLayout = (
  pairs: PairInput[],
  baseLabel: string,
  trackW: number,
  gapBp: number,
  othersMode: OthersMode,
  hiddenThreshold: number,
  commonIds: Set<number>,
  commonOnly: boolean,
  denoise: boolean,
  sharedAxis: boolean,
  stripBlankMbp: number,
  intraRelabel: boolean,
  intraScoreConfig: IntraScoreConfig
): VisualizationLayout[] => {
  const { minLocalEvents, gapStopMbp, driftK, complexMin } = intraScoreConfig;
  return useMemo(
    () =>
      computeVisualizationLayout(
        pairs,
        baseLabel,
        trackW,
        gapBp,
        othersMode,
        hiddenThreshold,
        commonIds,
        commonOnly,
        denoise,
        sharedAxis,
        stripBlankMbp,
        intraRelabel,
        intraScoreConfig
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      pairs,
      baseLabel,
      trackW,
      gapBp,
      othersMode,
      hiddenThreshold,
      commonIds,
      commonOnly,
      denoise,
      sharedAxis,
      stripBlankMbp,
      intraRelabel,
      minLocalEvents,
      gapStopMbp,
      driftK,
      complexMin,
    ]
  );
};
