import type { Chunk } from "@/types";
import type { ChunkEvent } from "@/src/constants";
import { withinThreshold } from "@/src/utils";

export type IntraRelabelMode = "off" | "minor" | "score";

export interface IntraScoreConfig {
  windowMbp: number;
  minBackbones: number;
  /** Window stops propagating where same-side gap >= this multiple of the opposite side's median gap. */
  gapStopRatio: number;
  /** Cutoff on relative drift (candidate drift / backbones' own drift). Decimal, e.g. 0.2 = mark when candidate is 20%+ above backbones' scatter. */
  driftPctOff: number;
}

type IntraItem = { idx: number; chunk: Chunk };
type Candidate = { drift: number; isInvert: boolean; items: IntraItem[] };

interface IntraGroup {
  baseOrder: IntraItem[];
  q: number[];
  regions: [number, number][];
}

type IntraLabeler = (groups: IntraGroup[]) => Map<number, ChunkEvent>;

interface BuildIntraResult {
  groups: IntraGroup[];
  strays: Map<number, ChunkEvent>;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = sorted.length >>> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};

// X-shape crossing point. For intra-chromosomal inversions, the symmetry
// center - so shared-pivot inverteds are likely the same event.
const pivotX = (c: Chunk): number => {
  const dB = c.bp2Base - c.bp1Base;
  const dQ = c.bp2Query - c.bp1Query;
  const denom = dB + dQ;
  return denom > 0 ? (dQ * c.bp1Base + dB * c.bp2Query) / denom : c.bp1Base;
};

const computeQ = (items: IntraItem[]): number[] => {
  const rank = new Map<number, number>();
  [...items]
    .sort((a, b) => a.chunk.bp1Query - b.chunk.bp1Query || a.idx - b.idx)
    .forEach((item, r) => rank.set(item.idx, r));
  return items.map((item) => rank.get(item.idx) ?? 0);
};

// Empty map returns the input ref so downstream memoization short-circuits.
const applyMap = (chunks: Chunk[], relabel: Map<number, ChunkEvent>): Chunk[] => {
  if (!relabel.size) return chunks;
  return chunks.map((c, i) => {
    const lab = relabel.get(i);
    return lab ? { ...c, dominant: lab } : c;
  });
};

// Small non-backbone chunks sandwiched between two backbones are noise:
// drop them from regions and hard-label translocation (or t+inv).
const STRAY_MAX_EVENTS = 50;

/**
 * Per-chr regions cut by backbone runs. Strays are returned separately
 * and merged into the final relabel map by `relabelIntraChunks`.
 */
const buildIntraRegions = (chunks: Chunk[], skip?: Set<number>): BuildIntraResult => {
  const groups = new Map<string, IntraItem[]>();
  chunks.forEach((chunk, idx) => {
    if (skip?.has(idx)) return;
    if (!chunk.chrBase || chunk.chrBase !== chunk.chrQuery) return;
    let arr = groups.get(chunk.chrBase);
    if (!arr) {
      arr = [];
      groups.set(chunk.chrBase, arr);
    }
    arr.push({ idx, chunk });
  });

  const out: IntraGroup[] = [];
  const strays = new Map<number, ChunkEvent>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let baseOrder = [...group].sort((a, b) => a.chunk.bp1Base - b.chunk.bp1Base || a.idx - b.idx);
    let q = computeQ(baseOrder);

    // Stray-noise pre-filter, one pass.
    const isBb = (k: number) => Math.abs(q[k] - k) <= 1 && !baseOrder[k].chunk.isInvert;
    const drop = new Set<number>();
    for (let k = 1; k < baseOrder.length - 1; k++) {
      if (isBb(k)) continue;
      if (baseOrder[k].chunk.eventCounts.total >= STRAY_MAX_EVENTS) continue;
      if (!isBb(k - 1) || !isBb(k + 1)) continue;
      drop.add(k);
      const item = baseOrder[k];
      const strayLabel: ChunkEvent = item.chunk.isInvert ? "translocation+inversion" : "translocation";
      if (item.chunk.dominant !== strayLabel) strays.set(item.idx, strayLabel);
    }
    if (drop.size) {
      baseOrder = baseOrder.filter((_, k) => !drop.has(k));
      q = computeQ(baseOrder);
    }

    const n = baseOrder.length;
    if (n < 2) continue;
    const invertAt = (k: number) => baseOrder[k].chunk.isInvert;
    const isBackbone = (k: number) => q[k] === k && !invertAt(k);

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

      // if (baseOrder[runStart]?.chunk.id === "jagger-3A-203") {
      //   console.log(
      //     baseOrder.slice(runStart, runEnd).map((c) => {
      //       const { id, ids, ...rest } = c.chunk;
      //       return rest;
      //     })
      //   );
      // }

      if (invertedCount === 0) {
        regions.push([runStart, runEnd]);
      } else {
        let lastInverted = runEnd - 1;
        while (!invertAt(lastInverted)) lastInverted--;
        const bodyEnd = lastInverted + 1;

        // Forward whose q clears the body's running subMaxQ has no
        // q-intercept and starts the next region. Inverted q-ascents stay
        // in-event (an outlier inverted can sit high without indicating
        // a new event). subMaxQ resets after a split.
        let subStart = runStart;
        let subMaxQ = -Infinity;
        for (let k = runStart; k < bodyEnd; k++) {
          if (invertAt(k)) {
            if (q[k] > subMaxQ) subMaxQ = q[k];
          } else if (subMaxQ !== -Infinity && q[k] > subMaxQ) {
            regions.push([subStart, k]);
            subStart = k;
            subMaxQ = -Infinity;
          }
        }

        let trailStart = runEnd;
        while (trailStart > bodyEnd && q[trailStart - 1] > subMaxQ) {
          trailStart--;
        }
        regions.push([subStart, trailStart]);
        if (trailStart < runEnd) regions.push([trailStart, runEnd]);
      }
      runStart = runEnd;
    }

    out.push({ baseOrder, q, regions });
  }
  return { groups: out, strays };
};

/** Offset-majority labeler: relabel minority-offset chunks per region. */
const labelMinorOffset: IntraLabeler = (groups) => {
  const relabel = new Map<number, ChunkEvent>();
  for (const { baseOrder, q, regions } of groups) {
    const invertAt = (k: number) => baseOrder[k].chunk.isInvert;
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
        if (inverted && !isForward) continue;
        const flip = flipForwards && isForward;
        if (!flip && offsetAt(k) === majorityOff) continue;
        const newLabel: ChunkEvent = isForward ? "translocation" : "translocation+inversion";
        if (item.chunk.dominant !== newLabel) relabel.set(item.idx, newLabel);
      }
    }
  }
  return relabel;
};

/**
 * Per region: candidates = each forward + clusters of inverteds (shared
 * pivot X). One region-specific baseline from backbones in the region's
 * window; each candidate's drift is `|offset - regionBaseline|` normalized
 * by the backbones' own scatter, so it's a dimensionless ratio. A
 * candidate is marked translocation when its relative drift exceeds
 * `driftPctOff`. Invariants per multi-candidate region: >=1 marked, >=1
 * unchanged.
 */
const runScorePass = (groups: IntraGroup[], config: IntraScoreConfig): Map<number, ChunkEvent> => {
  const { windowMbp, minBackbones, gapStopRatio, driftPctOff } = config;
  const W_BP = windowMbp * 1_000_000;
  const relabel = new Map<number, ChunkEvent>();

  for (const { baseOrder, q, regions } of groups) {
    const invertAt = (k: number) => baseOrder[k].chunk.isInvert;
    const baseCenter = (k: number) => (baseOrder[k].chunk.bp1Base + baseOrder[k].chunk.bp2Base) / 2;
    const queryCenter = (k: number) => (baseOrder[k].chunk.bp1Query + baseOrder[k].chunk.bp2Query) / 2;

    const backbones: { base: number; offset: number }[] = [];
    const allBaseCenters: number[] = [];
    for (let k = 0; k < baseOrder.length; k++) {
      const base = baseCenter(k);
      allBaseCenters.push(base);
      if (q[k] === k && !invertAt(k)) {
        backbones.push({ base, offset: queryCenter(k) - base });
      }
    }
    allBaseCenters.sort((a, b) => a - b);
    if (!backbones.length) continue;
    const globalMedian = median(backbones.map((b) => b.offset));

    // Per-side gap-aware: window stops where same-side gap >= gapStopRatio
    // * opposite-side median gap, so the baseline doesn't leak across a
    // structural break that only one side has.
    const windowBounds = (centerB: number): [number, number] => {
      const leftBases: number[] = [];
      const rightBases: number[] = [];
      for (const b of allBaseCenters) {
        if (b < centerB && centerB - b <= W_BP) leftBases.push(b);
        else if (b > centerB && b - centerB <= W_BP) rightBases.push(b);
      }
      leftBases.sort((a, b) => b - a);
      rightBases.sort((a, b) => a - b);

      const leftGaps: number[] = [];
      if (leftBases.length) leftGaps.push(centerB - leftBases[0]);
      for (let i = 1; i < leftBases.length; i++) leftGaps.push(leftBases[i - 1] - leftBases[i]);

      const rightGaps: number[] = [];
      if (rightBases.length) rightGaps.push(rightBases[0] - centerB);
      for (let i = 1; i < rightBases.length; i++) rightGaps.push(rightBases[i] - rightBases[i - 1]);

      const leftRef = leftGaps.length ? median(leftGaps) : 0;
      const rightRef = rightGaps.length ? median(rightGaps) : 0;

      let leftCap = centerB - W_BP;
      let pos = centerB;
      for (let i = 0; i < leftBases.length; i++) {
        if (rightRef > 0 && leftGaps[i] >= gapStopRatio * rightRef) {
          leftCap = pos;
          break;
        }
        pos = leftBases[i];
      }

      let rightCap = centerB + W_BP;
      pos = centerB;
      for (let i = 0; i < rightBases.length; i++) {
        if (leftRef > 0 && rightGaps[i] >= gapStopRatio * leftRef) {
          rightCap = pos;
          break;
        }
        pos = rightBases[i];
      }

      return [leftCap, rightCap];
    };

    for (const [s, e] of regions) {
      // Region-specific reference: one window/baseline for the whole region.
      // `localBackboneDrift` is the backbones' own scatter around it; each
      // candidate's drift is stored RELATIVE to that scatter, so the cutoff
      // `driftPctOff` is a direct dimensionless threshold (e.g. 0.2 = mark
      // if candidate's drift is at least 20% larger than backbones' drift).
      const chunkCenters: number[] = [];
      for (let k = s; k < e; k++) chunkCenters.push(baseCenter(k));
      const regionCenter = median(chunkCenters);
      const [winLo, winHi] = windowBounds(regionCenter);
      const localOffsets: number[] = [];
      for (const bb of backbones) if (bb.base >= winLo && bb.base <= winHi) localOffsets.push(bb.offset);
      const regionBaseline = localOffsets.length >= minBackbones ? median(localOffsets) : globalMedian;

      const relDrift = (centerB: number, centerQ: number): number => {
        return regionBaseline !== 0 ? Math.abs(Math.abs((centerQ - centerB) / regionBaseline) - 1) : Infinity;
      };

      const candidates: Candidate[] = [];

      // Cluster inverteds by pivot proximity - shared pivot = same event.
      const invSorted: IntraItem[] = [];
      for (let k = s; k < e; k++) if (invertAt(k)) invSorted.push(baseOrder[k]);
      invSorted.sort((a, b) => pivotX(a.chunk) - pivotX(b.chunk));

      const clusters: IntraItem[][] = [];
      for (const item of invSorted) {
        const last = clusters[clusters.length - 1];
        if (!last) {
          clusters.push([item]);
          continue;
        }

        const prev = last[last.length - 1];
        if (withinThreshold(pivotX(item.chunk), pivotX(prev.chunk), 0.07)) last.push(item);
        else clusters.push([item]);
      }

      for (const cluster of clusters) {
        let minB = Infinity;
        let maxB = -Infinity;
        let minQ = Infinity;
        let maxQ = -Infinity;
        for (const { chunk: c } of cluster) {
          if (c.bp1Base < minB) minB = c.bp1Base;
          if (c.bp2Base > maxB) maxB = c.bp2Base;
          if (c.bp1Query < minQ) minQ = c.bp1Query;
          if (c.bp2Query > maxQ) maxQ = c.bp2Query;
        }
        candidates.push({
          drift: relDrift((minB + maxB) / 2, (minQ + maxQ) / 2),
          isInvert: true,
          items: cluster,
        });
      }
      for (let k = s; k < e; k++) {
        if (invertAt(k)) continue;
        candidates.push({
          drift: relDrift(baseCenter(k), queryCenter(k)),
          isInvert: false,
          items: [baseOrder[k]],
        });
      }

      const n = candidates.length;
      if (n < 2) continue;

      candidates.sort((a, b) => a.drift - b.drift);
      if (candidates[n - 1].drift === 0) continue;

      // if (baseOrder[s]?.chunk.id === "jagger-3A-203") {
      // if (baseOrder[s]?.chunk.id === "spelt-3A-209") {
      //   console.log("debug");
      //
      //   console.log(candidates);
      //   console.log(regionBaseline);
      // }

      // Each candidate is judged on its own: drift_rel > driftPctOff marks
      // it. Default firstSplit = n-1 keeps the largest marked even when
      // nothing else clears the cutoff; clamp to [1, n-1] keeps >=1
      // unchanged.
      let firstSplit = n - 1;
      for (let i = 0; i < n; i++) {
        if (candidates[i].drift > driftPctOff) {
          firstSplit = i;
          break;
        }
      }
      firstSplit = Math.max(1, Math.min(n - 1, firstSplit));
      for (let i = firstSplit; i < n; i++) {
        const cand = candidates[i];
        const newLabel: ChunkEvent = cand.isInvert ? "translocation+inversion" : "translocation";
        for (const item of cand.items) {
          if (item.chunk.dominant !== newLabel) relabel.set(item.idx, newLabel);
        }
      }
    }
  }
  return relabel;
};

/** Score-pass labeler: region-relative drift vs `driftPctOff`. */
const relabelByScore = (chunks: Chunk[], config: IntraScoreConfig): Map<number, ChunkEvent> => {
  const { groups, strays } = buildIntraRegions(chunks);
  const relabel = runScorePass(groups, config);
  for (const [idx, lab] of strays) relabel.set(idx, lab);
  return relabel;
};

/** Public entry. Dispatches to the chosen labeler; `off` returns input ref. */
export const relabelIntraChunks = (
  chunks: Chunk[],
  mode: IntraRelabelMode,
  scoreConfig: IntraScoreConfig
): Chunk[] => {
  if (mode === "off") return chunks;
  if (mode === "score") return applyMap(chunks, relabelByScore(chunks, scoreConfig));
  const { groups, strays } = buildIntraRegions(chunks);
  const relabel = labelMinorOffset(groups);
  for (const [idx, lab] of strays) relabel.set(idx, lab);
  return applyMap(chunks, relabel);
};
