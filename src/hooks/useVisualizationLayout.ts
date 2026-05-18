import { useMemo } from "react";
import type { ResultRow } from "@/types";
import { CHR_GAP_PX, CHROM_THICKNESS, ChunkEvent, OthersMode, RIBBON_GAP } from "@/src/constants";
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

// Tracks: 0..N. Track i is the row shared by pair (i-1)'s query side and pair i's base side.
// Each pair p contributes chrBase to track p and chrQuery to track p+1 in a single pass.
// The pair-major order ensures track p's chrQuery side (from pair p-1) is populated before
// pair p's chrBase contribution checks the restrict set.
const buildTracks = (cleanChunksPerPair: Chunk[][], pairCount: number, othersMode: OthersMode): Track[] => {
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
const partitionTracksByChrSet = (tracks: Track[]): number[] => {
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
const computeGroupBounds = (
  tracks: Track[],
  groupOf: number[]
): { groupChrMin: Map<string, number>[]; groupChrMax: Map<string, number>[] } => {
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
const applyGlobalExtension = (
  groupChrMin: Map<string, number>[],
  unifiedChrMin: Map<string, number>,
  stripBlankBp: number
): Map<string, number>[] =>
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

/**
 * Relabel chunks within each `chrBase === chrQuery` group to surface
 * intra-chromosomal translocations that `chunkRows` alone can't see.
 * Mutates only `chunk.dominant`; row-level fields and `eventCounts` are
 * untouched.
 *
 * Per group (sorted by base order, with query rank `q`):
 *
 * 1. **Backbone** - forward chunks at `q[k] === k`. Never relabeled.
 *    Inverted chunks at positional matches are excluded; they are
 *    coincidences inside inversion blocks (e.g. the middle of an
 *    odd-length inversion).
 *
 * 2. **Regions** - maximal non-backbone runs. Forward-major runs become
 *    one region. Inversion-major runs are refined:
 *    - The inverted body is cut wherever an inverted chunk's `q` jumps
 *      strictly above the running max `q` in the current sub-region;
 *      forward chunks inside the body ride along without anchoring or
 *      updating the max.
 *    - After the last inverted chunk, only the maximal suffix of forward
 *      chunks whose `q` is **outside** the last sub-region's q range is
 *      peeled off as a trailing-forward region. Intercepting forwards
 *      (q inside that range) stay with the last sub-region.
 *
 * 3. **Labeling** per region:
 *    - All-inverted region: skipped wholesale (every chunk keeps
 *      `inversion`).
 *    - Inversion-major region (mixed): **inverted chunks always keep
 *      `inversion`** - they are never relabeled in an inversion-major
 *      region. Forwards are decided as:
 *      * `invEvents >= fwdEvents` (flip-forwards on): all forwards
 *        relabeled to `translocation` regardless of offset.
 *      * `invEvents < fwdEvents`: forwards take part in the offset
 *        majority under `-q-b`; minority-offset forwards become
 *        `translocation`.
 *    - Forward-major region: every chunk votes on the offset majority
 *      under `q-b`. Minority-offset chunks are relabeled by `isInvert` -
 *      forwards to `translocation`, inverteds to
 *      `translocation+inversion`.
 *    - Majority offset is chosen by total `eventCounts.total`, then by
 *      chunk count, then by earliest-in-base-order.
 *
 * See `relabel.md` for definitions, worked examples, and rationale.
 */
const relabelIntraChunks = (chunks: Chunk[]): Chunk[] => {
  type Item = { idx: number; chunk: Chunk };
  const groups = new Map<string, Item[]>();
  chunks.forEach((chunk, idx) => {
    if (!chunk.chrBase || chunk.chrBase !== chunk.chrQuery) return;
    let arr = groups.get(chunk.chrBase);
    if (!arr) {
      arr = [];
      groups.set(chunk.chrBase, arr);
    }
    arr.push({ idx, chunk });
  });

  const relabel = new Map<number, ChunkEvent>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const baseOrder = [...group].sort((a, b) => a.chunk.bp1Base - b.chunk.bp1Base || a.idx - b.idx);
    const queryRank = new Map<number, number>();
    [...baseOrder]
      .sort((a, b) => a.chunk.bp1Query - b.chunk.bp1Query || a.idx - b.idx)
      .forEach((item, rank) => queryRank.set(item.idx, rank));
    const q = baseOrder.map((item) => queryRank.get(item.idx) ?? 0);
    const n = baseOrder.length;
    const invertAt = (k: number) => baseOrder[k].chunk.isInvert;
    const isBackbone = (k: number) => q[k] === k && !invertAt(k);

    // Regions: maximal non-backbone runs. Inversion-major runs are split on
    // q jumps, with the trailing tail of non-intercepting forwards (q outside
    // the last sub-region's q range) peeled off as its own region.
    const regions: [number, number][] = [];
    let runStart = 0;
    while (runStart < n) {
      if (isBackbone(runStart)) {
        runStart++;
        continue;
      }
      let runEnd = runStart + 1;
      while (runEnd < n && !isBackbone(runEnd)) runEnd++;

      let invertedCount = 0;
      for (let k = runStart; k < runEnd; k++) if (invertAt(k)) invertedCount++;

      if (invertedCount * 2 <= runEnd - runStart) {
        regions.push([runStart, runEnd]);
      } else {
        let lastInverted = runEnd - 1;
        while (!invertAt(lastInverted)) lastInverted--;
        const bodyEnd = lastInverted + 1;

        let subStart = runStart;
        let subMaxQ = -Infinity;
        for (let k = runStart; k < bodyEnd; k++) {
          if (!invertAt(k)) continue;
          if (subMaxQ === -Infinity) {
            subMaxQ = q[k];
          } else if (q[k] > subMaxQ) {
            regions.push([subStart, k]);
            subStart = k;
            subMaxQ = q[k];
          }
        }

        // Trailing forwards whose q intercepts the last sub-region's q range
        // are not truly trailing - they sit inside the inversion in query
        // space and stay with the last sub-region. The trailing tail is the
        // maximal suffix of forwards with q strictly outside [subMinQ, subMaxQ].
        let trailStart = runEnd;
        while (trailStart > bodyEnd && q[trailStart - 1] > subMaxQ) {
          trailStart--;
        }
        regions.push([subStart, trailStart]);
        if (trailStart < runEnd) regions.push([trailStart, runEnd]);
      }
      runStart = runEnd;
    }

    for (const [s, e] of regions) {
      let invCount = 0;
      let invEvents = 0;
      let fwdEvents = 0;
      for (let k = s; k < e; k++) {
        const ev = baseOrder[k].chunk.eventCounts.total;
        if (invertAt(k)) {
          invCount++;
          invEvents += ev;
        } else fwdEvents += ev;
      }
      if (invCount === e - s) continue;

      const inverted = invCount * 2 > e - s;
      // Flip-forwards: in inverted regions where invEvents >= fwdEvents,
      // forwards become translocations by orientation and are dropped from
      // the offset majority. See relabel.md.
      const flipForwards = inverted && fwdEvents <= invEvents;
      const offsetAt = (k: number) => (inverted ? -q[k] - k : q[k] - k);

      const counts = new Map<number, number>();
      const events = new Map<number, number>();
      for (let k = s; k < e; k++) {
        if (flipForwards && !invertAt(k)) continue;
        const o = offsetAt(k);
        counts.set(o, (counts.get(o) ?? 0) + 1);
        events.set(o, (events.get(o) ?? 0) + baseOrder[k].chunk.eventCounts.total);
      }

      // Majority offset: events first, count tiebreak, base order last
      // (Map iteration order + strict `>`).
      let majorityOff = NaN;
      let majCount = 0;
      let majEvents = 0;
      counts.forEach((cnt, o) => {
        const ev = events.get(o) ?? 0;
        if (ev > majEvents || (ev === majEvents && cnt > majCount)) {
          majCount = cnt;
          majEvents = ev;
          majorityOff = o;
        }
      });

      for (let k = s; k < e; k++) {
        const item = baseOrder[k];
        const isForward = !item.chunk.isInvert;
        if (inverted && !isForward) continue; // inversion-major: inverteds always stay
        const flip = flipForwards && isForward;
        if (!flip && offsetAt(k) === majorityOff) continue;
        const newLabel: ChunkEvent = isForward ? "translocation" : "translocation+inversion";
        if (item.chunk.dominant !== newLabel) relabel.set(item.idx, newLabel);
      }
    }
  }

  if (!relabel.size) return chunks;
  return chunks.map((c, i) => {
    const lab = relabel.get(i);
    return lab ? { ...c, dominant: lab } : c;
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
  relabelIntra: boolean
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

  const relabeledChunksPerPair = useMemo<Chunk[][]>(
    () => (relabelIntra ? cleanChunksPerPair.map((cs) => relabelIntraChunks(cs)) : cleanChunksPerPair),
    [cleanChunksPerPair, relabelIntra]
  );

  const tracks = useMemo<Track[]>(
    () => buildTracks(cleanChunksPerPair, pairs.length, othersMode),
    [cleanChunksPerPair, othersMode, pairs.length]
  );

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

  // Per-pair axes under shared-axis: partition tracks into groups of identical chr sets,
  // unify bounds within each group, then extend chrMin out to the global unified min unless
  // stripBlankBp would cut a leading blank. chrMax stays at group-max.
  const pairAxes = useMemo(() => {
    if (!sharedAxis) {
      return pairs.map((_, p) => ({ baseAxis: tracks[p], queryAxis: tracks[p + 1] }));
    }

    const groupOf = partitionTracksByChrSet(tracks);
    const { groupChrMin, groupChrMax } = computeGroupBounds(tracks, groupOf);
    const groupFinalChrMin = applyGlobalExtension(groupChrMin, unifiedAxis.chrMin, stripBlankBp);

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

      const ribbons = computeRibbons(relabeledChunksPerPair[p], baseRow, queryRow, othersMode);
      const y1bot = baseRow.y + CHROM_THICKNESS + RIBBON_GAP;
      const y2top = queryRow.y - RIBBON_GAP;

      return { baseRow, queryRow, ribbons, y1bot, y2top };
    });
  }, [pairs, pairAxes, perChrPxPerBp, relabeledChunksPerPair, baseLabel, trackW, othersMode]);
};
