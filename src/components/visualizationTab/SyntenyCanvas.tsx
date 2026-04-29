import { useCallback, type MouseEvent, type RefObject } from "react";
import { Group } from "@visx/group";
import { PAD, CHROM_THICKNESS, SVG_H } from "@/src/constants";
import type { BaseRow, Chunk, ChunkRibbon, QueryRow } from "@/types";
import styles from "./VisualizationTab.module.css";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { RibbonLayer } from "@/src/components/visualizationTab/RibbonLayer";
import { BaseRowLayer, QueryRowLayer } from "@/src/components/visualizationTab/GenomeRowLayer";
import { ChunkTooltip } from "@/src/components/visualizationTab/ChunkTooltip";

/** px gap between the bottom of the query bar label and the tooltip top */
const TOOLTIP_OFFSET_Y = 22;

interface SyntenyCanvasProps {
  svgRef: RefObject<SVGSVGElement>;
  wrapRef: RefObject<HTMLDivElement>;
  svgW: number;
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
    (_e: MouseEvent<SVGPathElement>, ch: Chunk, rib: ChunkRibbon) => {
      // Centre tooltip on the ribbon's midpoint (in canvas-space px)
      const ribbonMidX = PAD.left + (rib.bxs + rib.bxe) / 2;
      setTooltip({ ribbonMidX, chunk: ch });
      setHoverChunk(ch.id);
    },
    [setTooltip, setHoverChunk]
  );

  // Fixed y: bottom of query bar + gap for the chromosome label
  const tooltipTopY = queryRow.y + CHROM_THICKNESS + TOOLTIP_OFFSET_Y;

  return (
    <div className={styles.canvasWrap} ref={wrapRef}>
      <svg ref={svgRef} className={styles.svgCanvas} width={svgW} height={SVG_H} onMouseLeave={clearHover}>
        <rect width={svgW} height={SVG_H} fill="white" />
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

      {tooltip && (
        <ChunkTooltip chunk={tooltip.chunk} ribbonMidX={tooltip.ribbonMidX} topY={tooltipTopY} canvasW={svgW} />
      )}
    </div>
  );
}
