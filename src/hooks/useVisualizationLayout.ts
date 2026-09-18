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
  sameScale: boolean;
}

export interface PairInput {
  data: ResultRow[];
  queryLabel: string;
  // How far each chr runs in this query's whole BED. Bounds how far a lighter row pads its last
  // bar; leave it out and the pair's own rows stand in.
  chrExtent?: Map<string, number>;
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
  intraScoreConfig: IntraScoreConfig,
  baseChrExtent?: Map<string, number>
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
  // stripBlankBp would cut a leading blank. chrMax is padded further down, once the shared
  // px/bp is known, so every row reaches trackW.
  const groupOf = partitionTracksByChrSet(tracks);

  const finalAxes: Track[] = (() => {
    if (!sharedAxis) return tracks;

    const { groupChrMin, groupChrMax } = computeGroupBounds(tracks, groupOf);
    const groupFinalChrMin = applyGlobalExtension(groupChrMin, unifiedAxis.chrMin, stripBlankBp);

    return tracks.map((t, i) => ({
      chrMin: groupFinalChrMin[groupOf[i]],
      chrMax: groupChrMax[groupOf[i]],
      chrOrder: t.chrOrder,
      needsOthersStub: t.needsOthersStub,
    }));
  })();

  const axisTotalBp = (axis: Track) =>
    axis.chrOrder.reduce(
      (total, chr) => total + ((axis.chrMax.get(chr) ?? 0) - (axis.chrMin.get(chr) ?? 0)),
      0
    );
  const axisTargetW = (axis: Track) => trackW - (axis.chrOrder.length - 1) * CHR_GAP_PX;

  // One px/bp for the whole figure: the smallest per-track ratio, so the track carrying the most bp
  // fills trackW and no track is ever compressed to fit.
  const sharedPxPerBp = (() => {
    if (!sharedAxis) return undefined;
    let best = Infinity;
    for (const axis of finalAxes) {
      if (!axis.chrOrder.length) continue;
      const totalBp = axisTotalBp(axis);
      if (totalBp <= 0) continue;
      const ratio = axisTargetW(axis) / totalBp;
      if (ratio < best) best = ratio;
    }
    return isFinite(best) ? best : undefined;
  })();

  // How far each track's chrs run. The caller passes its whole BED's extent; without it the
  // track's own rows stand in, which recovers what chunk filtering dropped but nothing past the
  // join.
  const trackChrExtent: Map<string, number>[] = (() => {
    const fromRows = (rows: ResultRow[], query: boolean) => {
      const out = new Map<string, number>();
      for (const r of rows) {
        const chr = query ? r.chromosomeQuery : r.chromosomeBase;
        const end = query ? r.p2Query : r.p2Base;
        const cur = out.get(chr);
        if (cur === undefined || end > cur) out.set(chr, end);
      }
      return out;
    };
    const head = baseChrExtent ?? fromRows(pairs[0]?.data ?? [], false);
    return [head, ...pairs.map((p) => p.chrExtent ?? fromRows(p.data, true))];
  })();

  // Furthest any row carries each chr. The rows are different genomes of one chromosome at one
  // scale, and a group already unions its members' bounds, so the bound is figure-wide. Measured
  // per row or per group it lands behind the bars a row lines up with, and the row ends short.
  const figureChrExtent = (() => {
    const out = new Map<string, number>();
    for (const extent of trackChrExtent) {
      extent?.forEach((bp, chr) => {
        const cur = out.get(chr);
        if (cur === undefined || bp > cur) out.set(chr, bp);
      });
    }
    return out;
  })();

  // A tail runs no further than the chr does, and only where the rows above and below end on that
  // same chr - otherwise it hangs over a different one. The neighbour test covers the whole group,
  // so one group stays one axis and its members pad alike.
  const extensionCap = (i: number, lastChr: string) => {
    for (let t = 0; t < finalAxes.length; t++) {
      if (groupOf[t] !== groupOf[i]) continue;
      for (const neighbour of [finalAxes[t - 1], finalAxes[t + 1]]) {
        if (neighbour && neighbour.chrOrder[neighbour.chrOrder.length - 1] !== lastChr) return 0;
      }
    }
    return figureChrExtent.get(lastChr) ?? 0;
  };

  // Pad the last chr of every lighter axis so its row still reaches trackW. The deficit is converted
  // back to bp at the shared ratio, so px/bp is untouched - the row ends flush without being drawn at
  // a scale of its own. Tracks in one group share bounds, so they pad identically and stay aligned.
  const paddedAxes: Track[] =
    sharedPxPerBp === undefined
      ? finalAxes
      : finalAxes.map((axis, i) => {
          const n = axis.chrOrder.length;
          if (!n) return axis;
          const deficitPx = axisTargetW(axis) - axisTotalBp(axis) * sharedPxPerBp;
          if (deficitPx <= 0) return axis;
          const lastChr = axis.chrOrder[n - 1];
          const dataMax = axis.chrMax.get(lastChr) ?? 0;
          const extended = Math.min(dataMax + deficitPx / sharedPxPerBp, extensionCap(i, lastChr));
          if (extended <= dataMax) return axis;
          const chrMax = new Map(axis.chrMax);
          chrMax.set(lastChr, extended);
          return { ...axis, chrMax };
        });

  const pairAxes = pairs.map((_, p) => ({ baseAxis: paddedAxes[p], queryAxis: paddedAxes[p + 1] }));

  const globalPxPerBp = (() => {
    if (sharedPxPerBp === undefined) return undefined;
    const allChrs = new Set<string>();
    for (const axis of paddedAxes) for (const chr of axis.chrOrder) allChrs.add(chr);
    if (!allChrs.size) return undefined;
    return new Map(Array.from(allChrs, (chr) => [chr, sharedPxPerBp]));
  })();

  return pairs.map((pair, p) => {
    const { baseAxis, queryAxis } = pairAxes[p];

    const baseRow = buildBaseRow(
      baseAxis.chrMax,
      baseAxis.chrMin,
      baseAxis.chrOrder,
      p === 0 ? baseLabel : "",
      trackW,
      othersMode,
      globalPxPerBp
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

    const queryRow = buildQueryRow(specs, pair.queryLabel, trackW, globalPxPerBp);

    const ribbons = computeRibbons(relabeledChunksPerPair[p], baseRow, queryRow, othersMode);
    const y1bot = baseRow.y + CHROM_THICKNESS + RIBBON_GAP;
    const y2top = queryRow.y - RIBBON_GAP;

    return { baseRow, queryRow, ribbons, y1bot, y2top, sameScale: groupOf[p] === groupOf[p + 1] };
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
  intraScoreConfig: IntraScoreConfig,
  baseChrExtent?: Map<string, number>
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
        intraScoreConfig,
        baseChrExtent
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      baseChrExtent,
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
