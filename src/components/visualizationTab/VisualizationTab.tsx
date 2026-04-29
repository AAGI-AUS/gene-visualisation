import { useRef, useEffect } from "react";
import type { ResultRow } from "@/types";
import styles from "./VisualizationTab.module.css";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { Controls } from "@/src/components/visualizationTab/Controls";
import { SyntenyCanvas } from "@/src/components/visualizationTab/SyntenyCanvas";
import { PAD, SVG_H, TOOLTIP_SPACING } from "@/src/constants";
import { ChunkTooltip } from "@/src/components/visualizationTab/ChunkTooltip";

interface VisualizationTabProps {
  data: ResultRow[][];
}

export function VisualizationTab({ data }: VisualizationTabProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  if (!data.length) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>⬡</span>
        <span className={styles.emptyTitle}>No data to visualize</span>
        <span className={styles.emptySub}>Run an analysis first</span>
      </div>
    );
  }

  const svgH = data.length * SVG_H - (data.length - 1) * PAD.top;
  const height = `${svgH + TOOLTIP_SPACING}px`;
  return (
    <div className={styles.container}>
      <Controls svgRef={svgRef} />
      <div className={styles.canvasWrap} ref={wrapRef} style={{ height }} onMouseLeave={clearHover}>
        <SyntenyCanvas data={data} width={svgW} height={svgH} svgRef={svgRef} />
        {tooltip && (
          <ChunkTooltip chunk={tooltip.chunk} ribbonMidX={tooltip.ribbonMidX} topY={svgH + 21} canvasW={svgW} />
        )}
      </div>
    </div>
  );
}
