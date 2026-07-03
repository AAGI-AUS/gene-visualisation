import type { RefObject } from "react";
import { useRef, useEffect } from "react";
import styles from "./VisualizationTab.module.css";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { SyntenyCanvas } from "@/src/components/visualizationTab/SyntenyCanvas";
import { Controls } from "@/src/components/visualizationTab/Controls";
import { CHROM_THICKNESS, ROW_GAP, SVG_H, TOOLTIP_SPACING } from "@/src/constants";
import { ChunkTooltip } from "@/src/components/visualizationTab/ChunkTooltip";
import type { Result } from "@/src/store/useAppStore";
import { registerSvgEl } from "@/src/components/visualizationTab/batchExport";

interface VisualizationTabProps {
  data: Result;
  svgRef: RefObject<SVGSVGElement>;
}

export const VisualizationTab = ({ data, svgRef }: VisualizationTabProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);

  const svgW = useVisualizationStore((s) => s.svgW);
  const setSvgW = useVisualizationStore((s) => s.setSvgW);
  const tooltip = useVisualizationStore((s) => s.tooltip);
  const clearHover = useVisualizationStore((s) => s.clearHover);

  // Sync SVG width with container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setSvgW(w - 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setSvgW]);

  useEffect(() => {
    registerSvgEl(svgRef.current);
    return () => registerSvgEl(null);
  });

  const svgH = SVG_H + (data.length - 1) * (CHROM_THICKNESS + ROW_GAP);
  const height = `${svgH + TOOLTIP_SPACING}px`;
  return (
    <>
      <Controls svgRef={svgRef} />
      <div className={styles.container}>
        <div className={styles.canvasWrap} ref={wrapRef} style={{ height }} onMouseLeave={clearHover}>
          <SyntenyCanvas data={data} width={svgW} height={svgH} svgRef={svgRef} />
          {tooltip && <ChunkTooltip {...tooltip} canvasW={svgW} />}
        </div>
      </div>
    </>
  );
};
