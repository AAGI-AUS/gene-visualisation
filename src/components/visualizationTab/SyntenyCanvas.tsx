import { useEffect, useMemo, type RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { Result, useAppStore } from "@/src/store/useAppStore";
import { LinePair } from "@/src/components/visualizationTab/LinePair";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { PAD } from "@/src/constants";
import {
  useVisualizationLayout,
  type PairInput,
  type VisualizationLayout,
} from "@/src/hooks/useVisualizationLayout";
import {
  registerVisibleChunks,
  registerVisiblePredicted,
  type PredictedByLine,
} from "@/src/components/visualizationTab/batchExport";
import {
  findLargestGapCenter,
  getPredictingLines,
  getPredictingRange,
} from "@/src/components/visualizationTab/utils";
import type { CentromereData, ChrBar } from "@/types";

const EMPTY_POSITIONS: Map<string, number[]> = new Map();

const getCentromere = (centromere: CentromereData, label: string): Map<string, number[]> =>
  centromere.get(label.toLowerCase()) ?? EMPTY_POSITIONS;

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

const buildPredicted = (
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

interface SyntenyCanvasProps {
  data: Result;
  svgRef: RefObject<SVGSVGElement>;
  width: number;
  height: number;
}

export const SyntenyCanvas = ({ data, svgRef, width, height }: SyntenyCanvasProps) => {
  const base = useAppStore((s) => s.base);
  const commonIds = useAppStore((s) => s.commonIds);
  const centromere = useAppStore((s) => s.centromere);
  const svgW = useVisualizationStore((s) => s.svgW);
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const commonOnly = useVisualizationStore((s) => s.commonOnly);
  const denoise = useVisualizationStore((s) => s.denoise);
  const sharedAxis = useVisualizationStore((s) => s.sharedAxis);
  const { relabel, ...intra } = useVisualizationStore((s) => s.intra);
  const stripBlankMbp = useVisualizationStore((s) => s.stripBlankMbp);

  const pairs = useMemo<PairInput[]>(
    () => data.map((d) => ({ data: d.rows, queryLabel: d.name.split(".")[0] })),
    [data]
  );

  const baseLabel = base?.name.split(".")[0].toLowerCase() ?? "";

  const layouts = useVisualizationLayout(
    pairs,
    baseLabel,
    svgW - PAD.left - PAD.right,
    1000 * gapBp,
    othersMode,
    hiddenThreshold,
    commonIds,
    commonOnly,
    denoise,
    sharedAxis,
    stripBlankMbp,
    relabel,
    intra
  );

  const predictedPerPair = useMemo(
    () =>
      layouts.map((layout, i) => {
        const queryLineKey = pairs[i].queryLabel.toLowerCase();
        const querySlotBars = layout.queryRow.slots.filter((s): s is ChrBar => s.kind === "chr");
        const queryPredicted = buildPredicted(querySlotBars, queryLineKey, collectIntervals(layout, "query"));
        const basePredicted =
          i === 0
            ? buildPredicted(layout.baseRow.bars, baseLabel, collectIntervals(layout, "base"))
            : EMPTY_POSITIONS;
        return { basePredicted, queryPredicted, queryLineKey };
      }),
    [layouts, pairs, baseLabel]
  );

  useEffect(() => {
    registerVisibleChunks(
      layouts.map((l, i) => ({
        queryLabel: pairs[i].queryLabel.toLowerCase(),
        chunks: l.ribbons.map((r) => r.chunk),
      }))
    );

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
    predictedPerPair.forEach(({ basePredicted, queryPredicted, queryLineKey }, i) => {
      if (i === 0) merge(baseLabel, basePredicted);
      merge(queryLineKey, queryPredicted);
    });
    registerVisiblePredicted(predicted);
  }, [layouts, pairs, predictedPerPair, baseLabel]);

  return (
    <svg ref={svgRef} className={styles.svgCanvas} width={width} height={height}>
      <rect width={width} height={height} fill="white" />
      {layouts.map((layout, i) => (
        <LinePair
          key={i}
          layout={layout}
          i={i}
          total={layouts.length}
          nextLayout={layouts[i + 1]}
          baseCentromere={i === 0 ? getCentromere(centromere, baseLabel) : EMPTY_POSITIONS}
          queryCentromere={getCentromere(centromere, pairs[i].queryLabel)}
          basePredicted={predictedPerPair[i].basePredicted}
          queryPredicted={predictedPerPair[i].queryPredicted}
        />
      ))}
    </svg>
  );
};
