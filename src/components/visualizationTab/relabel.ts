import type { Chunk } from "@/types";
import type { ChunkEvent } from "@/src/constants";

export interface IntraScoreConfig {
  minLocalEvents: number;
  /** Outward walk stops on a side at the first gap >= this many Mbp between an inner chunk's far edge and its
   * outer neighbor's near edge (or between the region center and the first chunk on that side). Edges are
   * averaged across base+query coords. */
  gapStopMbp: number;
  driftK: number;
  complexMin: number;
}

type IntraItem = { idx: number; chunk: Chunk };
type Candidate = { score: number; isInvert: boolean; items: IntraItem[] };

interface IntraGroup {
  baseOrder: IntraItem[];
  q: number[];
  regions: [number, number][];
}

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

/**
 * Weighted median by ascending `value`. Items with non-positive or NaN
 * `weight` are dropped. Returns 0 when no positive-weight item remains.
 * When cumulative weight lands exactly on half-total at an item boundary,
 * returns the mean of that item and the next.
 */
const weightedMedian = (items: { value: number; weight: number }[]): number => {
  const sorted = items.filter((it) => it.weight > 0).sort((a, b) => a.value - b.value);
  if (!sorted.length) return 0;
  const total = sorted.reduce((s, it) => s + it.weight, 0);
  const half = total / 2;
  let cum = 0;
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i].weight;
    if (cum === half && i + 1 < sorted.length) return (sorted[i].value + sorted[i + 1].value) / 2;
    if (cum > half) return sorted[i].value;
  }
  return sorted[sorted.length - 1].value;
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
// const PIVOT_CLUSTER_THRESHOLD = 500_000;
const PIVOT_CLUSTER_THRESHOLD = 3_000_000;

// Pre-normalize, candidates whose sorted scores are within this tolerance
// collapse into one event-weighted group score so a cluster of near-equal
// outliers can't pull min-max apart and inflate driftK for the rest.
const SCORE_DIFF_TOL = 0.03;

/**
 * Group inverteds whose pivot-X positions are close enough to share an event.
 * Sorts by pivot ascending, then folds each item into the running cluster
 * when its pivot is within `PIVOT_CLUSTER_THRESHOLD` of the cluster's mean
 * pivot. Anchoring to the mean (rather than the last item) keeps a chain
 * of barely-close items from drifting one cluster across a wide span.
 */
const clusterInverteds = (items: IntraItem[]): IntraItem[][] => {
  const sorted = [...items].sort((a, b) => pivotX(a.chunk) - pivotX(b.chunk));
  const clusters: IntraItem[][] = [];
  const centers: number[] = [];
  for (const item of sorted) {
    const p = pivotX(item.chunk);
    const i = clusters.length - 1;
    if (i >= 0 && Math.abs(p - centers[i]) <= PIVOT_CLUSTER_THRESHOLD) {
      const n = clusters[i].length;
      centers[i] = (centers[i] * n + p) / (n + 1);
      clusters[i].push(item);
    } else {
      clusters.push([item]);
      centers.push(p);
    }
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

// Backbone = chunk whose query-order rank equals its base-order index.
const makeIsBackbone = (q: number[]) => (k: number) => q[k] === k;

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
 * Build per-chr regions by cutting at the smallest closed permutation window: a run from `runStart` extends
 * until `set(q[runStart..runEnd)) === {runStart..runEnd-1}`.
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
    const isBackbone = makeIsBackbone(q);

    const regions: [number, number][] = [];
    let runStart = 0;
    while (runStart < n) {
      if (isBackbone(runStart)) {
        runStart++;
        continue;
      }
      // Extend until set(q[runStart..runEnd)) === {runStart..runEnd-1}, so backbones are not splitting it
      let runEnd = runStart;
      let minQ = Infinity;
      let maxQ = -Infinity;
      while (runEnd < n) {
        if (q[runEnd] < minQ) minQ = q[runEnd];
        if (q[runEnd] > maxQ) maxQ = q[runEnd];
        runEnd++;
        if (minQ === runStart && maxQ === runEnd - 1) break;
      }

      regions.push([runStart, runEnd]);
      runStart = runEnd;
    }

    out.push({ baseOrder, q, regions });
  }

  return { groups: out, strays };
};

/**
 * Per-group geometry: `baseOrder` and `q` plus closures for chunk centers, mixed-space edges
 * (avgBp1/avgBp2), the backbone test, and a weighted backbone sample. Bundled so the
 * score-pass helpers take one parameter instead of threading half a dozen positional args each.
 */
interface Geometry {
  baseOrder: IntraItem[];
  q: number[];
  invertAt: (k: number) => boolean;
  baseCenter: (k: number) => number;
  queryCenter: (k: number) => number;
  avgBp1: (k: number) => number;
  avgBp2: (k: number) => number;
  isBackbone: (k: number) => boolean;
  backboneSample: (k: number) => { value: number; weight: number };
}

const makeGeometry = (group: IntraGroup): Geometry => {
  const { baseOrder, q } = group;
  const invertAt = (k: number) => baseOrder[k].chunk.isInvert;
  const baseCenter = (k: number) => (baseOrder[k].chunk.bp1Base + baseOrder[k].chunk.bp2Base) / 2;
  const queryCenter = (k: number) => (baseOrder[k].chunk.bp1Query + baseOrder[k].chunk.bp2Query) / 2;
  const avgBp1 = (k: number) => (baseOrder[k].chunk.bp1Base + baseOrder[k].chunk.bp1Query) / 2;
  const avgBp2 = (k: number) => (baseOrder[k].chunk.bp2Base + baseOrder[k].chunk.bp2Query) / 2;
  const isBackbone = makeIsBackbone(q);
  const backboneSample = (k: number) => ({
    value: queryCenter(k) - baseCenter(k),
    weight: baseOrder[k].chunk.eventCounts.total,
  });
  return { baseOrder, q, invertAt, baseCenter, queryCenter, avgBp1, avgBp2, isBackbone, backboneSample };
};

/**
 * Walk outward from `regionCenter` collecting backbones until their event weight reaches
 * `minLocalEvents`. Closeness uses the chunk edge facing the center (avgBp1 right of center,
 * avgBp2 left), so wide chunks anchored near the center still count as near. A side stops at
 * the first gap >= `gapStopBp` between an inner chunk's far edge and its outer neighbor's
 * near edge (or between `regionCenter` and the first chunk on that side).
 */
const collectLocalBackbones = (
  geom: Geometry,
  regionCenter: number,
  minLocalEvents: number,
  gapStopBp: number
): { value: number; weight: number }[] => {
  const { baseOrder, baseCenter, avgBp1, avgBp2, isBackbone, backboneSample } = geom;

  let splitIdx = baseOrder.length;
  for (let k = 0; k < baseOrder.length; k++) {
    if (baseCenter(k) >= regionCenter) {
      splitIdx = k;
      break;
    }
  }

  let leftK = splitIdx - 1;
  let rightK = splitIdx;
  let leftInner = regionCenter;
  let rightInner = regionCenter;
  let leftDone = leftK < 0;
  let rightDone = rightK >= baseOrder.length;

  const local: { value: number; weight: number }[] = [];
  let accEvents = 0;

  while (accEvents < minLocalEvents && !(leftDone && rightDone)) {
    const dL = leftDone ? Infinity : regionCenter - avgBp2(leftK);
    const dR = rightDone ? Infinity : avgBp1(rightK) - regionCenter;

    if (dL <= dR) {
      const gap = leftInner - avgBp2(leftK);
      if (gapStopBp > 0 && gap >= gapStopBp) {
        leftDone = true;
        continue;
      }
      if (isBackbone(leftK)) {
        const sample = backboneSample(leftK);
        local.push(sample);
        accEvents += sample.weight;
      }
      leftInner = avgBp1(leftK);
      leftK--;
      if (leftK < 0) leftDone = true;
    } else {
      const gap = avgBp1(rightK) - rightInner;
      if (gapStopBp > 0 && gap >= gapStopBp) {
        rightDone = true;
        continue;
      }
      if (isBackbone(rightK)) {
        const sample = backboneSample(rightK);
        local.push(sample);
        accEvents += sample.weight;
      }
      rightInner = avgBp2(rightK);
      rightK++;
      if (rightK >= baseOrder.length) rightDone = true;
    }
  }

  return local;
};

/**
 * Build the candidate list for one region: each forward chunk becomes one
 * candidate; inverteds are bucketed by pivot-X via `clusterInverteds`,
 * and each cluster becomes a single candidate scored at its envelope
 * center.
 */
const buildRegionCandidates = (
  geom: Geometry,
  s: number,
  e: number,
  scoreOf: (centerB: number, centerQ: number) => number
): Candidate[] => {
  const { baseOrder, invertAt, baseCenter, queryCenter } = geom;
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
  return candidates;
};

/**
 * Collapse near-equal sorted scores into one event-weighted group score so a tight cluster of
 * similar outliers can't widen min-max and inflate the driftK gate for the rest of the region.
 * Adjacent gaps <= `SCORE_DIFF_TOL` chain into one group; groupScore = sum(score * eventWeight)
 * / sum(eventWeight). Mutates `candidates`; assumes ascending sort by score.
 */
const mergeScoreClusters = (candidates: Candidate[]): void => {
  let gi = 0;
  while (gi < candidates.length) {
    let gj = gi + 1;
    while (gj < candidates.length && candidates[gj].score - candidates[gj - 1].score <= SCORE_DIFF_TOL) gj++;
    if (gj > gi + 1) {
      let totalWeight = 0;
      let weightedSum = 0;
      for (let k = gi; k < gj; k++) {
        const w = candidates[k].items.reduce((sum, it) => sum + it.chunk.eventCounts.total, 0);
        totalWeight += w;
        weightedSum += candidates[k].score * w;
      }
      const groupScore = totalWeight > 0 ? weightedSum / totalWeight : candidates[gi].score;
      for (let k = gi; k < gj; k++) candidates[k].score = groupScore;
    }
    gi = gj;
  }
};

/**
 * Score-mark per region. Local backbones from `collectLocalBackbones` give a weighted-median
 * baseline (or `globalMed` when the local sample is empty); each candidate from
 * `buildRegionCandidates` scores `|offset / med - 1|`. After sort and `mergeScoreClusters`,
 * scores are min-max normalized to [0, 1] and any above `driftK` are marked. A region with
 * >= `complexMin` distinct merged group scores flags its chromosome as complex.
 */
const runScorePass = (
  groups: IntraGroup[],
  config: IntraScoreConfig
): { relabel: Map<number, ChunkEvent>; complexChrs: Set<string> } => {
  const { minLocalEvents, gapStopMbp, driftK, complexMin } = config;
  const gapStopBp = gapStopMbp * 1e6;
  const relabel = new Map<number, ChunkEvent>();
  const complexChrs = new Set<string>();

  for (const group of groups) {
    const geom = makeGeometry(group);
    const { baseOrder, baseCenter, isBackbone, backboneSample } = geom;
    const chrBase = baseOrder[0]?.chunk.chrBase;

    const globalSamples: { value: number; weight: number }[] = [];
    for (let k = 0; k < baseOrder.length; k++) {
      if (isBackbone(k)) globalSamples.push(backboneSample(k));
    }
    if (!globalSamples.length) continue;
    const globalMed = weightedMedian(globalSamples);

    const markCand = (cand: Candidate) => {
      const newLabel: ChunkEvent = cand.isInvert ? "translocation+inversion" : "translocation";
      for (const item of cand.items) {
        if (item.chunk.dominant !== newLabel) relabel.set(item.idx, newLabel);
      }
    };

    for (const [s, e] of group.regions) {
      const chunkCenters: number[] = [];
      for (let k = s; k < e; k++) chunkCenters.push(baseCenter(k));
      const regionCenter = median(chunkCenters);

      const localBackbones = collectLocalBackbones(geom, regionCenter, minLocalEvents, gapStopBp);
      const med = localBackbones.length ? weightedMedian(localBackbones) : globalMed;
      const scoreOf = (centerB: number, centerQ: number) => Math.abs((centerQ - centerB) / med - 1);

      const candidates = buildRegionCandidates(geom, s, e, scoreOf);
      if (!candidates.length || candidates.length === 1) continue;

      candidates.sort((a, b) => a.score - b.score);
      mergeScoreClusters(candidates);

      const distinctScores = new Set<number>();
      for (const c of candidates) distinctScores.add(c.score);
      if (chrBase && distinctScores.size >= complexMin) complexChrs.add(chrBase);

      if (candidates.length === 2) {
        if (candidates[0].score !== candidates[1].score) markCand(candidates[1]);
        continue;
      }

      const minScore = candidates[0].score;
      const maxScore = candidates[candidates.length - 1].score;
      const range = maxScore - minScore;
      for (const c of candidates) c.score = range > 0 ? (c.score - minScore) / range : 0;

      for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].score >= driftK) markCand(candidates[i]);
      }
    }
  }
  return { relabel, complexChrs };
};

/**
 * Score labeler. Pass 1 runs the normal pipeline and flags chromosomes that contain at least one region with >=
 * `complexMin` merged score groups. Pass 2 rebuilds regions with pass-1 translocations excluded and re-scores
 * flagged chromosomes.
 */
const relabelByScore = (chunks: Chunk[], config: IntraScoreConfig) => {
  const pass1 = buildIntraRegions(chunks);
  const { relabel, complexChrs } = runScorePass(pass1.groups, config);
  for (const [idx, lab] of pass1.strays) relabel.set(idx, lab);

  if (!complexChrs.size) return relabel;

  const pass2 = buildIntraRegions(chunks, new Set(relabel.keys()));
  const complexGroups = pass2.groups.filter(
    (g) => g.baseOrder.length > 0 && complexChrs.has(g.baseOrder[0].chunk.chrBase)
  );
  const { relabel: relabel2 } = runScorePass(complexGroups, config);
  for (const [idx, lab] of relabel2) relabel.set(idx, lab);
  for (const [idx, lab] of pass2.strays) {
    if (complexChrs.has(chunks[idx].chrBase)) relabel.set(idx, lab);
  }

  return relabel;
};

/** Public entry. Runs the score labeler when `enabled`, otherwise returns the input ref. */
export const relabelIntraChunks = (chunks: Chunk[], enabled: boolean, scoreConfig: IntraScoreConfig) => {
  if (!enabled) return chunks;
  return applyMap(chunks, relabelByScore(chunks, scoreConfig));
};
