import type { Chunk } from "@/types";
import type { ChunkEvent } from "@/src/constants";
import { withinThreshold } from "@/src/utils";

export type IntraRelabelMode = "off" | "minor" | "score";

export interface IntraScoreConfig {
  windowMbp: number;
  minBackbones: number;
  /** Window stops propagating where same-side gap >= this multiple of the opposite side's median gap. */
  gapStopRatio: number;
  /** Number of drift-clusters per region. Candidates are sorted by drift then split at the largest `groupCount - 1` gaps. Clamped to [2, candidate count]. */
  groupCount: number;
  /** Fraction of groups (highest-drift first) marked as translocations. Decimal in [0, 1]; clamped per region so >=1 group stays unchanged and >=1 gets marked. */
  markPercentile: number;
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

// Two inverteds within this relative pivot-X distance are treated as one event.
const PIVOT_CLUSTER_THRESHOLD = 0.07;

/**
 * Group inverteds whose pivot-X positions are close enough to share an event.
 * Sorts by pivot ascending, then single-linkage joins adjacent items that
 * fall within `PIVOT_CLUSTER_THRESHOLD` relative distance.
 */
const clusterInvertedsByPivot = (items: IntraItem[]): IntraItem[][] => {
  const sorted = [...items].sort((a, b) => pivotX(a.chunk) - pivotX(b.chunk));
  const clusters: IntraItem[][] = [];
  for (const item of sorted) {
    const last = clusters[clusters.length - 1];
    const near =
      last && withinThreshold(pivotX(item.chunk), pivotX(last[last.length - 1].chunk), PIVOT_CLUSTER_THRESHOLD);
    if (near) last.push(item);
    else clusters.push([item]);
  }
  return clusters;
};

/** Center of the bounding box of a cluster's chunks, in base and query space. */
const clusterEnvelopeCenter = (cluster: IntraItem[]): { centerB: number; centerQ: number } => {
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
  return { centerB: (minB + maxB) / 2, centerQ: (minQ + maxQ) / 2 };
};

/**
 * Split index that marks the top `percentile` fraction of `n` ordered units.
 * Mark count is clamped to [1, n-1], so multi-unit input always keeps >=1
 * unchanged and >=1 marked.
 */
const percentileSplitIndex = (n: number, percentile: number): number => {
  const markCount = Math.max(1, Math.min(n - 1, Math.round(n * percentile)));
  return n - markCount;
};

/**
 * Partition `sorted` (drift-ascending) into `groupCount` consecutive groups
 * by splitting at the `groupCount - 1` largest drift gaps. Group count is
 * clamped to [1, sorted.length]; groups stay in drift-ascending order.
 */
const groupByLargestGaps = (sorted: Candidate[], groupCount: number): Candidate[][] => {
  const n = sorted.length;
  const G = Math.max(1, Math.min(n, groupCount));
  if (G === 1) return [sorted];

  const gaps: { after: number; size: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    gaps.push({ after: i + 1, size: sorted[i + 1].drift - sorted[i].drift });
  }
  gaps.sort((a, b) => b.size - a.size);
  const splits = gaps
    .slice(0, G - 1)
    .map((g) => g.after)
    .sort((a, b) => a - b);

  const out: Candidate[][] = [];
  let prev = 0;
  for (const idx of splits) {
    out.push(sorted.slice(prev, idx));
    prev = idx;
  }
  out.push(sorted.slice(prev));
  return out;
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
 * Iteratively split a non-backbone run into regions. Per iteration:
 * minQ (fixed, from the unsplit prefix) anchors all chunks at or before
 * its owner. Past the owner, we close at the first chunk whose q breaks
 * a dense [minQ, maxQ] (range fully covered) and isn't an adjacent up
 * extension. Adjacent up keeps forward chains intact.
 */
const splitRun = (q: number[], runStart: number, runEnd: number, regions: [number, number][]) => {
  let start = runStart;
  while (start < runEnd) {
    let minQ = Infinity;
    let kMinQ = start;
    for (let k = start; k < runEnd; k++) {
      if (q[k] < minQ) {
        minQ = q[k];
        kMinQ = k;
      }
    }

    let maxQ = -Infinity;
    let coverSize = 0;
    for (let k = start; k <= kMinQ; k++) {
      if (q[k] > maxQ) maxQ = q[k];
      coverSize++;
    }

    let splitEnd = runEnd;
    for (let k = kMinQ + 1; k < runEnd; k++) {
      if (coverSize === maxQ - minQ + 1 && q[k] !== maxQ + 1) {
        splitEnd = k;
        break;
      }
      if (q[k] > maxQ) maxQ = q[k];
      coverSize++;
    }

    regions.push([start, splitEnd]);
    start = splitEnd;
  }
};

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

      splitRun(q, runStart, runEnd, regions);
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
 * window; each candidate's drift is `|offset / regionBaseline - 1|`, the
 * relative deviation of its query-vs-base offset from the regional
 * baseline. Candidates are sorted by drift, partitioned into `groupCount`
 * groups at the largest gaps, then the top `markPercentile` fraction of
 * groups gets marked translocation. Invariants per multi-candidate
 * region: >=1 group marked, >=1 unchanged.
 */
const runScorePass = (groups: IntraGroup[], config: IntraScoreConfig): Map<number, ChunkEvent> => {
  const { windowMbp, minBackbones, gapStopRatio, groupCount, markPercentile } = config;
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
      // `markPercentile` then picks the top fraction by drift to mark.
      const chunkCenters: number[] = [];
      for (let k = s; k < e; k++) chunkCenters.push(baseCenter(k));
      const regionCenter = median(chunkCenters);
      const [winLo, winHi] = windowBounds(regionCenter);
      const localOffsets: number[] = [];
      for (const bb of backbones) if (bb.base >= winLo && bb.base <= winHi) localOffsets.push(bb.offset);
      const regionBaseline = localOffsets.length >= minBackbones ? median(localOffsets) : globalMedian;

      const relDrift = (centerB: number, centerQ: number): number => {
        return regionBaseline !== 0 ? Math.abs((centerQ - centerB) / regionBaseline - 1) : Infinity;
      };

      const candidates: Candidate[] = [];
      const inverteds: IntraItem[] = [];
      for (let k = s; k < e; k++) {
        if (invertAt(k)) {
          inverteds.push(baseOrder[k]);
        } else {
          candidates.push({
            drift: relDrift(baseCenter(k), queryCenter(k)),
            isInvert: false,
            items: [baseOrder[k]],
          });
        }
      }
      for (const cluster of clusterInvertedsByPivot(inverteds)) {
        const { centerB, centerQ } = clusterEnvelopeCenter(cluster);
        candidates.push({ drift: relDrift(centerB, centerQ), isInvert: true, items: cluster });
      }

      const n = candidates.length;
      if (n < 2) continue;
      candidates.sort((a, b) => a.drift - b.drift);
      if (candidates[n - 1].drift === 0) continue;

      const candGroups = groupByLargestGaps(candidates, groupCount);
      const G = candGroups.length;
      if (G < 2) continue;
      const firstMarked = percentileSplitIndex(G, markPercentile);
      for (let g = firstMarked; g < G; g++) {
        for (const cand of candGroups[g]) {
          const newLabel: ChunkEvent = cand.isInvert ? "translocation+inversion" : "translocation";
          for (const item of cand.items) {
            if (item.chunk.dominant !== newLabel) relabel.set(item.idx, newLabel);
          }
        }
      }
    }
  }
  return relabel;
};

/** Score-pass labeler: top `markPercentile` of drift groups per region. */
const relabelByScore = (chunks: Chunk[], config: IntraScoreConfig) => {
  const { groups, strays } = buildIntraRegions(chunks);
  const relabel = runScorePass(groups, config);
  for (const [idx, lab] of strays) relabel.set(idx, lab);

  return relabel;
};

/** Public entry. Dispatches to the chosen labeler; `off` returns input ref. */
export const relabelIntraChunks = (chunks: Chunk[], mode: IntraRelabelMode, scoreConfig: IntraScoreConfig) => {
  if (mode === "off") return chunks;
  if (mode === "score") return applyMap(chunks, relabelByScore(chunks, scoreConfig));

  const { groups, strays } = buildIntraRegions(chunks);
  const relabel = labelMinorOffset(groups);
  for (const [idx, lab] of strays) relabel.set(idx, lab);

  return applyMap(chunks, relabel);
};
