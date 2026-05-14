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
  sharedAxis: boolean
): VisualizationLayout[] => {
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

  // Shared-axis variant of a track: per-line chr list where the first chr extends its left
  // edge to the unified chrMin and the last chr extends its right edge to the unified
  // chrMax. Middle chrs stay per-track (truncated both sides).
  const axisForShared = useMemo(() => {
    return (t: Track) => {
      const chrOrder = t.chrOrder;
      if (!chrOrder.length) return t;
      const chrMin = new Map(t.chrMin);
      const chrMax = new Map(t.chrMax);
      const first = chrOrder[0];
      const last = chrOrder[chrOrder.length - 1];
      const uMinFirst = unifiedAxis.chrMin.get(first);
      const uMaxLast = unifiedAxis.chrMax.get(last);
      if (uMinFirst !== undefined) chrMin.set(first, uMinFirst);
      if (uMaxLast !== undefined) chrMax.set(last, uMaxLast);
      return { chrMin, chrMax, chrOrder, needsOthersStub: t.needsOthersStub };
    };
  }, [unifiedAxis]);

  // Per-chr global px/bp: each chromosome's scale equals the smallest per-row ratio across
  // the shared-axis rows it appears in, so the chr always fits in its most-crowded row and
  // its bp coordinates align across rows.
  const perChrPxPerBp = useMemo(() => {
    if (!sharedAxis) return undefined;
    const out = new Map<string, number>();
    for (const t of tracks) {
      const axis = axisForShared(t);
      const n = axis.chrOrder.length;
      if (!n) continue;
      let totalBp = 0;
      for (const chr of axis.chrOrder) {
        totalBp += (axis.chrMax.get(chr) ?? 0) - (axis.chrMin.get(chr) ?? 0);
      }
      if (totalBp <= 0) continue;
      const gap = (n - 1) * CHR_GAP_PX;
      const rowPxPerBp = (trackW - gap) / totalBp;
      for (const chr of axis.chrOrder) {
        const cur = out.get(chr);
        if (cur === undefined || rowPxPerBp < cur) out.set(chr, rowPxPerBp);
      }
    }
    return out.size ? out : undefined;
  }, [sharedAxis, tracks, axisForShared, trackW]);

  return useMemo<VisualizationLayout[]>(() => {
    return pairs.map((pair, p) => {
      const baseAxis = sharedAxis ? axisForShared(tracks[p]) : tracks[p];
      const queryAxis = sharedAxis ? axisForShared(tracks[p + 1]) : tracks[p + 1];

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
  }, [pairs, tracks, axisForShared, sharedAxis, perChrPxPerBp, cleanChunksPerPair, baseLabel, trackW, othersMode]);
};
