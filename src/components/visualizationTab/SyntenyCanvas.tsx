import { useMemo, type RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { Result, useAppStore } from "@/src/store/useAppStore";
import { LinePair } from "@/src/components/visualizationTab/LinePair";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { PAD } from "@/src/constants";
import { useVisualizationLayout, type PairInput } from "@/src/hooks/useVisualizationLayout";

interface SyntenyCanvasProps {
  data: Result;
  svgRef: RefObject<SVGSVGElement>;
  width: number;
  height: number;
}

export const SyntenyCanvas = ({ data, svgRef, width, height }: SyntenyCanvasProps) => {
  const base = useAppStore((s) => s.base);
  const commonIds = useAppStore((s) => s.commonIds);
  const svgW = useVisualizationStore((s) => s.svgW);
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const commonOnly = useVisualizationStore((s) => s.commonOnly);
  const denoise = useVisualizationStore((s) => s.denoise);
  const sharedAxis = useVisualizationStore((s) => s.sharedAxis);
  const stripBlankMbp = useVisualizationStore((s) => s.stripBlankMbp);

  const pairs = useMemo<PairInput[]>(
    () => data.map((d) => ({ data: d.rows, queryLabel: d.name.split(".")[0] })),
    [data]
  );

  const layouts = useVisualizationLayout(
    pairs,
    base?.name.split(".")[0] ?? "",
    svgW - PAD.left - PAD.right,
    gapBp,
    othersMode,
    hiddenThreshold,
    commonIds,
    commonOnly,
    denoise,
    sharedAxis,
    stripBlankMbp
  );

  return (
    <svg ref={svgRef} className={styles.svgCanvas} width={width} height={height}>
      <rect width={width} height={height} fill="white" />
      {layouts.map((layout, i) => (
        <LinePair key={i} layout={layout} i={i} total={layouts.length} />
      ))}
    </svg>
  );
};
