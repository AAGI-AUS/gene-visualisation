import { useRef, useEffect } from "react";
import type { ResultRow } from "@/types";
import styles from "./VisualizationTab.module.css";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { useVisualizationLayout } from "@/src/store/useVisualizationLayout";
import { Controls } from "@/src/components/visualizationTab/Controls";
import { SyntenyCanvas } from "@/src/components/visualizationTab/SyntenyCanvas";
import { PAD } from "@/src/constants";

interface VisualizationTabProps {
  data: ResultRow[];
  baseLabel?: string;
  queryLabel?: string;
}

export function VisualizationTab({
  data,
  baseLabel = "Baseline",
  queryLabel = "Query",
}: VisualizationTabProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const svgW = useVisualizationStore((s) => s.svgW);
  const setSvgW = useVisualizationStore((s) => s.setSvgW);
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);

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

  const layout = useVisualizationLayout(
    data,
    baseLabel,
    queryLabel,
    svgW - PAD.left - PAD.right,
    gapBp,
    othersMode,
    hiddenThreshold
  );

  if (!data.length) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>⬡</span>
        <span className={styles.emptyTitle}>No data to visualize</span>
        <span className={styles.emptySub}>Run an analysis first</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Controls
        chunkCount={layout.chunks.length}
        globalCounts={layout.globalCounts}
        othersCount={layout.othersCount}
        svgRef={svgRef}
      />
      <SyntenyCanvas
        svgRef={svgRef}
        wrapRef={wrapRef}
        svgW={svgW}
        y1bot={layout.y1bot}
        y2top={layout.y2top}
        baseRow={layout.baseRow}
        queryRow={layout.queryRow}
        ribbons={layout.ribbons}
      />
    </div>
  );
}
