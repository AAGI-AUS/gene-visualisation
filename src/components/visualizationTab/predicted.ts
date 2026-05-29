import type { ChrBar } from "@/types";
import type { PairInput, VisualizationLayout } from "@/src/hooks/useVisualizationLayout";
import {
  findLargestGapCenter,
  getPredictingLines,
  getPredictingRange,
} from "@/src/components/visualizationTab/utils";

export type PredictedByLine = Map<string, Map<string, number>>;

export interface PredictedPerPair {
  basePredicted: Map<string, number[]>;
  queryPredicted: Map<string, number[]>;
  queryLineKey: string;
}

const EMPTY_POSITIONS: Map<string, number[]> = new Map();

const collectIntervals = (
  layout: VisualizationLayout,
  side: "base" | "query"
): Map<string, [number, number][]> => {
  const out = new Map<string, [number, number][]>();
  for (const rib of layout.ribbons) {
    const c = rib.chunk;
    const chr = side === "base" ? c.chrBase : c.chrQuery;
    if (!chr) continue;
    const p1 = side === "base" ? c.bp1Base : c.bp1Query;
    const p2 = side === "base" ? c.bp2Base : c.bp2Query;
    const arr = out.get(chr);
    if (arr) arr.push([p1, p2]);
    else out.set(chr, [[p1, p2]]);
  }
  return out;
};

const buildPredictedForBars = (
  bars: readonly ChrBar[],
  lineKey: string,
  intervalsByChr: Map<string, [number, number][]>
): Map<string, number[]> => {
  const out = new Map<string, number[]>();
  if (!lineKey) return out;
  for (const bar of bars) {
    if (!getPredictingLines(bar.chr).includes(lineKey)) continue;
    const { lo, hi } = getPredictingRange(bar.chr, lineKey);
    const center = findLargestGapCenter(intervalsByChr.get(bar.chr) ?? [], lo * 1_000_000, hi * 1_000_000);
    if (center !== null) out.set(bar.chr, [center]);
  }
  return out;
};

export const buildPredictedPerPair = (
  layouts: VisualizationLayout[],
  pairs: PairInput[],
  baseLabel: string
): PredictedPerPair[] =>
  layouts.map((layout, i) => {
    const queryLineKey = pairs[i].queryLabel.toLowerCase();
    const querySlotBars = layout.queryRow.slots.filter((s): s is ChrBar => s.kind === "chr");
    const queryPredicted = buildPredictedForBars(
      querySlotBars,
      queryLineKey,
      collectIntervals(layout, "query")
    );
    const basePredicted =
      i === 0
        ? buildPredictedForBars(layout.baseRow.bars, baseLabel, collectIntervals(layout, "base"))
        : EMPTY_POSITIONS;
    return { basePredicted, queryPredicted, queryLineKey };
  });

// Reduce per-pair predicted maps into one PredictedByLine keyed by line label.
// Base label only contributes via pair 0; later pairs' query labels chain through.
export const mergeIntoPredictedByLine = (perPair: PredictedPerPair[], baseLabel: string): PredictedByLine => {
  const predicted: PredictedByLine = new Map();
  const merge = (line: string, positions: Map<string, number[]>) => {
    if (!line || positions.size === 0) return;
    let into = predicted.get(line);
    if (!into) {
      into = new Map();
      predicted.set(line, into);
    }
    positions.forEach((bps, chr) => {
      if (bps.length) into!.set(chr, bps[0]);
    });
  };
  perPair.forEach(({ basePredicted, queryPredicted, queryLineKey }, i) => {
    if (i === 0) merge(baseLabel, basePredicted);
    merge(queryLineKey, queryPredicted);
  });
  return predicted;
};
