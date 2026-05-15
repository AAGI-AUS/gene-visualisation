import { useMemo } from "react";
import type { ResultRow } from "@/types";
import { CHR_GAP_PX, CHROM_THICKNESS, OthersMode, RIBBON_GAP } from "@/src/constants";
import type { BaseRow, Chunk, ChunkRibbon, QueryRow } from "@/types";
import {
  buildBaseRow,
  buildQueryRow,
  chunkRows,
  collectNoisyIds,
  computeRibbons,
  SlotSpec,
} from "@/src/components/visualizationTab/utils";

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

interface Track {
  chrMax: Map<string, number>;
  chrMin: Map<string, number>;
  chrOrder: string[];
  needsOthersStub: boolean;
}

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
  stripBlankMbp: number
): VisualizationLayout[] => {
  const stripBlankBp = stripBlankMbp > 0 ? stripBlankMbp * 1_000_000 : 0;
  const filteredData = useMemo<ResultRow[][]>(() => {
    const data = pairs.map((p) => p.data);
    if (commonOnly && commonIds.size) {
      return data.map((rows) => rows.filter((r) => commonIds.has(r.id)));
    }
    return data;
  }, [pairs, commonIds, commonOnly]);

  const chunksPerPair = useMemo<Chunk[][]>(() => {
    const buildPair = (rows: ResultRow[], queryLabel: string) => {
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

    let chunks = pairs.map((p, i) => buildPair(filteredData[i], p.queryLabel));
    if (denoise) {
      const noisy = collectNoisyIds(chunks);
      if (noisy.size) {
        chunks = pairs.map((p, i) =>
          buildPair(
            filteredData[i].filter((r) => !noisy.has(r.id)),
            p.queryLabel
          )
        );
      }
    }
    return chunks;
  }, [pairs, filteredData, gapBp, hiddenThreshold, denoise]);

  const cleanChunksPerPair = useMemo<Chunk[][]>(
    () => (othersMode === "hide" ? chunksPerPair.map((cs) => cs.filter((c) => !c.isOthers)) : chunksPerPair),
    [chunksPerPair, othersMode]
  );

  // Tracks: 0..N. Track i is the row shared by pair (i-1)'s query side and pair i's base side.
  // Each pair p contributes chrBase to track p and chrQuery to track p+1 in a single pass.
  // The pair-major order ensures track p's chrQuery side (from pair p-1) is populated before
  // pair p's chrBase contribution checks the restrict set.
  const tracks = useMemo<Track[]>(() => {
    const trackCount = pairs.length + 1;
    const out: Track[] = [];
    for (let i = 0; i < trackCount; i++) {
      out.push({ chrMax: new Map(), chrMin: new Map(), chrOrder: [], needsOthersStub: false });
    }

    for (let p = 0; p < pairs.length; p++) {
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
  }, [cleanChunksPerPair, othersMode, pairs.length]);

  const unifiedAxis = useMemo(() => {
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
  }, [tracks]);

  // Per-pair axes under shared-axis. Tracks are partitioned into "groups": maximal
  // sequences of consecutive tracks where every adjacent pair has matching chr sets. Within
  // a group, chrMin/chrMax are unified to group-min/group-max so every track in the group
  // shares the same axis (alignment is mandatory inside a group and never gets stripped).
  //
  // chrMin then extends from group-min to the global unified value — this is the only
  // place stripping kicks in: when stripBlankBp>0, the global extension is skipped if it
  // would create a leading blank > threshold, and the group keeps its tighter group-min.
  // chrMax has no global extension; it stays at group-max.
  const pairAxes = useMemo(() => {
    if (!sharedAxis) {
      return pairs.map((_, p) => ({ baseAxis: tracks[p], queryAxis: tracks[p + 1] }));
    }

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

    const groupFinalChrMin: Map<string, number>[] = [];
    for (let g = 0; g < groupCount; g++) {
      const cmin = new Map<string, number>();
      groupChrMin[g].forEach((v, chr) => {
        const u = unifiedAxis.chrMin.get(chr);
        if (u !== undefined && (stripBlankBp <= 0 || v - u <= stripBlankBp)) {
          cmin.set(chr, u);
        } else {
          cmin.set(chr, v);
        }
      });
      groupFinalChrMin.push(cmin);
    }

    const finalAxes: Track[] = tracks.map((t, i) => ({
      chrMin: groupFinalChrMin[groupOf[i]],
      chrMax: groupChrMax[groupOf[i]],
      chrOrder: t.chrOrder,
      needsOthersStub: t.needsOthersStub,
    }));

    return pairs.map((_, p) => ({ baseAxis: finalAxes[p], queryAxis: finalAxes[p + 1] }));
  }, [pairs, tracks, sharedAxis, unifiedAxis, stripBlankBp]);

  // One global px/bp: the smallest per-row ratio across all shared-axis rows, so every row
  // fits in trackW and bp coordinates align across rows and chromosomes.
  const perChrPxPerBp = useMemo(() => {
    if (!sharedAxis) return undefined;
    const allChrs = new Set<string>();
    let globalPxPerBp = Infinity;
    for (const { baseAxis, queryAxis } of pairAxes) {
      for (const axis of [baseAxis, queryAxis]) {
        const n = axis.chrOrder.length;
        if (!n) continue;
        let totalBp = 0;
        for (const chr of axis.chrOrder) {
          totalBp += (axis.chrMax.get(chr) ?? 0) - (axis.chrMin.get(chr) ?? 0);
          allChrs.add(chr);
        }
        if (totalBp <= 0) continue;
        const gap = (n - 1) * CHR_GAP_PX;
        const rowPxPerBp = (trackW - gap) / totalBp;
        if (rowPxPerBp < globalPxPerBp) globalPxPerBp = rowPxPerBp;
      }
    }
    if (!isFinite(globalPxPerBp) || !allChrs.size) return undefined;
    const out = new Map<string, number>();
    for (const chr of allChrs) out.set(chr, globalPxPerBp);
    return out;
  }, [sharedAxis, pairAxes, trackW]);

  return useMemo<VisualizationLayout[]>(() => {
    return pairs.map((pair, p) => {
      const { baseAxis, queryAxis } = pairAxes[p];

      const baseRow = buildBaseRow(
        baseAxis.chrMax,
        baseAxis.chrMin,
        baseAxis.chrOrder,
        p === 0 ? baseLabel : "",
        trackW,
        othersMode,
        perChrPxPerBp
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

      const queryRow = buildQueryRow(specs, pair.queryLabel, trackW, perChrPxPerBp);

      const ribbons = computeRibbons(cleanChunksPerPair[p], baseRow, queryRow, othersMode);
      const y1bot = baseRow.y + CHROM_THICKNESS + RIBBON_GAP;
      const y2top = queryRow.y - RIBBON_GAP;

      return { baseRow, queryRow, ribbons, y1bot, y2top };
    });
  }, [pairs, pairAxes, perChrPxPerBp, cleanChunksPerPair, baseLabel, trackW, othersMode]);
};
