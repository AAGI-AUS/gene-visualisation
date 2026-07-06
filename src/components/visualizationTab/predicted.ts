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

/** Collect ribbon chunk [bp1, bp2] intervals from a layout, grouped by chromosome on the given side. */
const collectIntervalsInChr = (layout: VisualizationLayout, side: "base" | "query") => {
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

type IntervalsInChr = ReturnType<typeof collectIntervalsInChr>;

/** For each bar mapped to lineKey, mark the largest-gap center inside its predicting range. */
const buildPredictedForBars = (bars: readonly ChrBar[], lineKey: string, intervalsInChr: IntervalsInChr) => {
  const out = new Map<string, number[]>();
  if (!lineKey) return out;
  for (const bar of bars) {
    if (!getPredictingLines(bar.chr).includes(lineKey)) continue;

    const { lo, hi } = getPredictingRange(bar.chr, lineKey);
    const center = findLargestGapCenter(intervalsInChr.get(bar.chr) ?? [], lo * 1e6, hi * 1e6);
    // array to match CentromereMarks' positions shape
    if (center !== null) out.set(bar.chr, [center]);
  }
  return out;
};

/** Compute predicted positions for each pair: query side always; base side only on pair 0. */
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
      collectIntervalsInChr(layout, "query")
    );
    const basePredicted =
      i === 0
        ? buildPredictedForBars(layout.baseRow.bars, baseLabel, collectIntervalsInChr(layout, "base"))
        : EMPTY_POSITIONS;

    return { basePredicted, queryPredicted, queryLineKey };
  });

/** Flatten per-pair predicted maps into one line->chr->bp map; base label only from pair 0. */
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
      // on a duplicate line+chr (e.g. same query label across pairs) the last one wins
      if (bps.length) into!.set(chr, bps[0]);
    });
  };

  merge(baseLabel, perPair[0].basePredicted);
  perPair.forEach(({ queryPredicted, queryLineKey }) => {
    merge(queryLineKey, queryPredicted);
  });

  return predicted;
};
