import { useCallback, type MouseEvent, type RefObject } from "react";
import { Group } from "@visx/group";
import type { BaseRow, Chunk, ChunkRibbon, QueryRow } from "@/types";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { BaseRowLayer, QueryRowLayer } from "./GenomeRowLayer";
import { RibbonLayer } from "./RibbonLayer";
import { ChunkTooltip } from "./ChunkTooltip";
import styles from "./VisualizationTab.module.css";
import { PAD } from "@/src/constants";

interface SyntenyCanvasProps {
  svgRef: RefObject<SVGSVGElement>;
  wrapRef: RefObject<HTMLDivElement>;
  svgW: number;
  svgH: number;
  y1bot: number;
  y2top: number;
  baseRow: BaseRow;
  queryRow: QueryRow;
  ribbons: ChunkRibbon[];
}

export function SyntenyCanvas({
  svgRef,
  wrapRef,
  svgW,
  svgH,
  y1bot,
  y2top,
  baseRow,
  queryRow,
  ribbons,
}: SyntenyCanvasProps) {
  const hoverChunk = useVisualizationStore((s) => s.hoverChunk);
  const tooltip = useVisualizationStore((s) => s.tooltip);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const setTooltip = useVisualizationStore((s) => s.setTooltip);
  const setHoverChunk = useVisualizationStore((s) => s.setHoverChunk);
  const clearHover = useVisualizationStore((s) => s.clearHover);

  const onMove = useCallback(
    (e: MouseEvent<SVGPathElement>, ch: Chunk) => {
      setTooltip({ cx: e.clientX, cy: e.clientY, chunk: ch });
      setHoverChunk(ch.id);
    },
    [setTooltip, setHoverChunk]
  );

  return (
    <div className={styles.canvasWrap} ref={wrapRef}>
      <svg ref={svgRef} className={styles.svgCanvas} width={svgW} height={svgH} onMouseLeave={clearHover}>
        <rect width={svgW} height={svgH} fill="white" />
        <Group left={PAD.left}>
          <RibbonLayer
            ribbons={ribbons}
            y1bot={y1bot}
            y2top={y2top}
            hoverChunk={hoverChunk}
            othersMode={othersMode}
            onMove={onMove}
          />
          <BaseRowLayer row={baseRow} />
          <QueryRowLayer row={queryRow} />
        </Group>
      </svg>

      {tooltip && <ChunkTooltip chunk={tooltip.chunk} cx={tooltip.cx} cy={tooltip.cy} />}
    </div>
  );
}
