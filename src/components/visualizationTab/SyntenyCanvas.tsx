import type { RefObject } from "react";
import { useMemo } from "react";
import styles from "./VisualizationTab.module.css";
import type { Result } from "@/src/store/useAppStore";
import { useAppStore } from "@/src/store/useAppStore";
import { LinePair } from "@/src/components/visualizationTab/LinePair";
import { Legend } from "@/src/components/visualizationTab/Legend";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { PAD } from "@/src/constants";
import type { PairInput } from "@/src/hooks/useVisualizationLayout";
import { useVisualizationLayout } from "@/src/hooks/useVisualizationLayout";
import { buildPredictedPerPair } from "@/src/components/visualizationTab/predicted";
import type { CentromereData } from "@/types";

const EMPTY_POSITIONS: Map<string, number[]> = new Map();

const getCentromere = (centromere: CentromereData, label: string): Map<string, number[]> =>
  centromere.get(label.toLowerCase()) ?? EMPTY_POSITIONS;

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
  const fontSize = useVisualizationStore((s) => s.fontSize);
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
    () => buildPredictedPerPair(layouts, pairs, baseLabel),
    [layouts, pairs, baseLabel]
  );

  return (
    <svg ref={svgRef} className={styles.svgCanvas} width={width} height={height}>
      <rect width={width} height={height} fill="white" />
      <Legend width={width} fontSize={fontSize - 2} />
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
