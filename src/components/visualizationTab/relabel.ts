import type { Chunk } from "@/types";
import type { ChunkEvent } from "@/src/constants";
import { withinThreshold } from "@/src/utils";

export type IntraRelabelMode = "off" | "minor" | "score";

export interface IntraScoreConfig {
  windowMbp: number;
  minBackbones: number;
  /** Window stops propagating in a direction at the first base-side gap >= this many Mbp (gap = distance between adjacent chunk centers, or between the region center and its nearest chunk on that side). Stops the baseline from leaking across a structural break. */
  gapStopMbp: number;
  /** Drift cutoff: per-candidate gate. Score = |offset / localBaseline - 1| is min-max normalized to [0, 1] per region; candidates whose normalized score > driftK are marked. driftK applies uniformly regardless of local scale. */
  driftK: number;
  /** Complex-region threshold: chrs whose intra group has >= complexMin items get a second score pass with pass-1 marks excluded, so the per-region normalization re-evaluates without the already-flagged outliers dominating the scale. */
  complexMin: number;
}

type IntraItem = { idx: number; chunk: Chunk };
type Candidate = { score: number; isInvert: boolean; items: IntraItem[] };

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
const PIVOT_CLUSTER_THRESHOLD = 1_000;

/**
 * Group inverteds whose pivot-X positions are close enough to share an event.
 * Sorts by pivot ascending, then single-linkage joins adjacent items that
 * fall within `PIVOT_CLUSTER_THRESHOLD` relative distance.
 */
const clusterInverteds = (items: IntraItem[]): IntraItem[][] => {
  const sorted = [...items].sort((a, b) => pivotX(a.chunk) - pivotX(b.chunk));
  const clusters: IntraItem[][] = [];
  for (const item of sorted) {
    const last = clusters[clusters.length - 1];
    const near =
      last && Math.abs(pivotX(item.chunk) - pivotX(last[last.length - 1].chunk)) <= PIVOT_CLUSTER_THRESHOLD;
    if (near) last.push(item);
    else clusters.push([item]);
  }
  return clusters;
};

/** Center of the bounding box of a cluster's chunks, in base and query space. */
const clusterEnvelopeCenter = (cluster: IntraItem[]) => {
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
 * find minQ across the remaining run. The prefix walk includes every
 * chunk up to and through the minQ owner, raising maxQ as needed. Past
 * the owner, keep including chunks (still raising maxQ) until the dense
 * [minQ, maxQ] range is fully covered, then cut at the next chunk.
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
      if (coverSize === maxQ - minQ + 1) {
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
      if (isBb(k) || !isBb(k - 1) || !isBb(k + 1)) continue;

      const item = baseOrder[k];
      if (item.chunk.eventCounts.total >= STRAY_MAX_EVENTS) continue;

      drop.add(k);
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
 * pivot X). Local backbone offsets (within ±windowMbp of the region
 * center, stopped at any same-side gap >= gapStopMbp) give a median +
 * MAD; if fewer than `minBackbones` land in the window, fall back to
 * group-global. Each candidate scores `|offset - median| / max(MAD,
 * MAD_FLOOR_BP)`.
 *
 * Scores are sorted and min-max normalized to [0, 1] per region so the
 * driftK gate applies uniformly regardless of local scale. Candidates
 * whose normalized score exceeds driftK are marked.
 */
const runScorePass = (groups: IntraGroup[], config: IntraScoreConfig): Map<number, ChunkEvent> => {
  const { windowMbp, minBackbones, gapStopMbp, driftK } = config;
  const windowBp = windowMbp * 1_000_000;
  const gapStopBp = gapStopMbp * 1_000_000;
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
    if (!backbones.length) continue;
    allBaseCenters.sort((a, b) => a - b);
    const globalOffsets = backbones.map((b) => b.offset);
    const globalMed = median(globalOffsets);

    // Walk outward from `centerB`, stopping in each direction at the first chunk-side gap >= GAP_STOP_BP (and never past ±W_BP).
    const windowBounds = (centerB: number): [number, number] => {
      let leftCap = centerB - windowBp;
      let prev = centerB;
      for (let i = allBaseCenters.length - 1; i >= 0; i--) {
        const b = allBaseCenters[i];
        if (b >= centerB) continue;
        if (b < leftCap) break;
        if (gapStopBp > 0 && prev - b >= gapStopBp) {
          leftCap = prev;
          break;
        }
        prev = b;
      }

      let rightCap = centerB + windowBp;
      prev = centerB;
      for (let i = 0; i < allBaseCenters.length; i++) {
        const b = allBaseCenters[i];
        if (b <= centerB) continue;
        if (b > rightCap) break;
        if (gapStopBp > 0 && b - prev >= gapStopBp) {
          rightCap = prev;
          break;
        }
        prev = b;
      }

      return [leftCap, rightCap];
    };

    for (const [s, e] of regions) {
      const chunkCenters: number[] = [];
      for (let k = s; k < e; k++) chunkCenters.push(baseCenter(k));
      const regionCenter = median(chunkCenters);
      const [winLo, winHi] = windowBounds(regionCenter);

      const localOffsets: number[] = [];
      for (const bb of backbones) if (bb.base >= winLo && bb.base <= winHi) localOffsets.push(bb.offset);

      let med: number;
      if (localOffsets.length >= minBackbones) med = median(localOffsets);
      else med = globalMed;

      const scoreOf = (centerB: number, centerQ: number) => Math.abs((centerQ - centerB) / med - 1);

      const candidates: Candidate[] = [];
      const inverteds: IntraItem[] = [];
      for (let k = s; k < e; k++) {
        if (invertAt(k)) {
          inverteds.push(baseOrder[k]);
        } else {
          candidates.push({
            score: scoreOf(baseCenter(k), queryCenter(k)),
            isInvert: false,
            items: [baseOrder[k]],
          });
        }
      }

      for (const cluster of clusterInverteds(inverteds)) {
        const { centerB, centerQ } = clusterEnvelopeCenter(cluster);
        candidates.push({ score: scoreOf(centerB, centerQ), isInvert: true, items: cluster });
      }

      if (!candidates.length || candidates.length === 1) continue;

      const markCand = (cand: Candidate) => {
        const newLabel: ChunkEvent = cand.isInvert ? "translocation+inversion" : "translocation";
        for (const item of cand.items) {
          if (item.chunk.dominant !== newLabel) relabel.set(item.idx, newLabel);
        }
      };

      candidates.sort((a, b) => a.score - b.score);
      // Min-max normalize per region so scores live in [0, 1] regardless of
      // the local backbone scale; driftK then applies uniformly.
      const minScore = candidates[0].score;
      const maxScore = candidates[candidates.length - 1].score;
      const range = maxScore - minScore;
      for (const c of candidates) c.score = range > 0 ? (c.score - minScore) / range : 0;

      if (candidates.length === 2) {
        markCand(candidates[1]);
        continue;
      }

      // Gap analysis. Bottom-half median of gaps gives a noise-robust scale
      // that isn't inflated by the very outlier-gaps we want to detect.
      // const gaps: number[] = [];
      // for (let i = 0; i < candidates.length - 1; i++) gaps.push(candidates[i + 1].score - candidates[i].score);

      for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].score > driftK) markCand(candidates[i]);
      }
    }
  }
  return relabel;
};

/**
 * Score-pass labeler. Pass 1 runs the normal pipeline. Pass 2 rebuilds
 * regions with pass-1 marks excluded and re-scores, but only for chrs
 * whose pass-1 intra-group size was >= complexMin — letting the per-region
 * min-max see a fresh score scale without the already-flagged outliers
 * dominating it. Smaller chrs stop at one pass.
 */
const relabelByScore = (chunks: Chunk[], config: IntraScoreConfig) => {
  const pass1 = buildIntraRegions(chunks);
  const relabel = runScorePass(pass1.groups, config);
  for (const [idx, lab] of pass1.strays) relabel.set(idx, lab);

  const complexChrs = new Set<string>();
  for (const g of pass1.groups) {
    if (g.baseOrder.length >= config.complexMin) complexChrs.add(g.baseOrder[0].chunk.chrBase);
  }
  if (!complexChrs.size) return relabel;

  const pass2 = buildIntraRegions(chunks, new Set(relabel.keys()));
  const complexGroups = pass2.groups.filter(
    (g) => g.baseOrder.length > 0 && complexChrs.has(g.baseOrder[0].chunk.chrBase)
  );
  const relabel2 = runScorePass(complexGroups, config);
  for (const [idx, lab] of relabel2) relabel.set(idx, lab);
  for (const [idx, lab] of pass2.strays) {
    if (complexChrs.has(chunks[idx].chrBase)) relabel.set(idx, lab);
  }

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
