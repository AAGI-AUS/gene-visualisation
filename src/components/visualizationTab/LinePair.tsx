import { useCallback, type MouseEvent } from "react";
import { CHROM_THICKNESS, PAD, ROW_GAP, SVG_H } from "@/src/constants";
import type { Chunk, ChunkRibbon } from "@/types";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { RibbonLayer } from "@/src/components/visualizationTab/RibbonLayer";
import { BaseRowLayer, QueryRowLayer } from "@/src/components/visualizationTab/GenomeRowLayer";
import { CoordinateGrid } from "@/src/components/visualizationTab/CoordinateGrid";
import { useAppStore } from "@/src/store/useAppStore";
import { Group } from "@visx/group";
import type { VisualizationLayout } from "@/src/hooks/useVisualizationLayout";

interface LinePairProps {
  layout: VisualizationLayout;
  i: number;
  total: number;
}

export const LinePair = ({ layout, i, total }: LinePairProps) => {
  const hoverChunk = useVisualizationStore((s) => s.hoverChunk);
  const setTooltip = useVisualizationStore((s) => s.setTooltip);
  const setHoverChunk = useVisualizationStore((s) => s.setHoverChunk);
  const sharedAxis = useVisualizationStore((s) => s.sharedAxis);
  const fontSize = useVisualizationStore((s) => s.fontSize);
  const palette = useAppStore((s) => s.palette);

  const { baseRow, queryRow, ribbons, y1bot, y2top } = layout;

  const onMove = useCallback(
    (_e: MouseEvent<SVGPathElement>, chunk: Chunk, rib: ChunkRibbon) => {
      const ribbonMidX = PAD.left + (rib.bxs + rib.bxe) / 2;
      const topY = SVG_H + i * (CHROM_THICKNESS + ROW_GAP) + 13;
      setTooltip({ ribbonMidX, chunk, topY });
      setHoverChunk(chunk.id);
    },
    [setTooltip, setHoverChunk, i]
  );

  const isFirst = i === 0;
  const isLast = i === total - 1;

  return (
    <Group left={PAD.left} top={i * (CHROM_THICKNESS + ROW_GAP)}>
      <RibbonLayer hoverChunk={hoverChunk} onMove={onMove} ribbons={ribbons} y1bot={y1bot} y2top={y2top} />
      <BaseRowLayer row={baseRow} noLine={i > 0} palette={palette} fontSize={fontSize} />
      <QueryRowLayer row={queryRow} palette={palette} fontSize={fontSize} />
      {sharedAxis && (
        <CoordinateGrid
          bars={baseRow.bars}
          lineTop={baseRow.y - 4}
          lineBottom={queryRow.y + CHROM_THICKNESS + 4}
          labelTopY={isFirst ? baseRow.y - 6 : null}
          labelBottomY={isLast ? queryRow.y + CHROM_THICKNESS + 13 : null}
          fontSize={fontSize - 1}
        />
      )}
    </Group>
  );
};
