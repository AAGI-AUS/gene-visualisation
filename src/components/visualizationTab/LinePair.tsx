import type { MouseEvent } from "react";
import { useCallback } from "react";
import { CHROM_THICKNESS, PAD, ROW_GAP, SVG_H } from "@/src/constants";
import type { Chunk, ChunkRibbon } from "@/types";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { RibbonLayer } from "@/src/components/visualizationTab/RibbonLayer";
import { BaseRowLayer, QueryRowLayer } from "@/src/components/visualizationTab/GenomeRowLayer";
import { CoordinateGrid } from "@/src/components/visualizationTab/CoordinateGrid";
import { CentromereMarks } from "@/src/components/visualizationTab/CentromereMarks";
import { useAppStore } from "@/src/store/useAppStore";
import { Group } from "@visx/group";
import type { VisualizationLayout } from "@/src/hooks/useVisualizationLayout";

interface LinePairProps {
  layout: VisualizationLayout;
  i: number;
  total: number;
  nextLayout?: VisualizationLayout;
  baseCentromere: Map<string, number[]>;
  queryCentromere: Map<string, number[]>;
  basePredicted: Map<string, number[]>;
  queryPredicted: Map<string, number[]>;
  tickStepBp: number;
}

const PREDICTED_COLOR = "blue";

export const LinePair = ({
  layout,
  i,
  total,
  nextLayout,
  baseCentromere,
  queryCentromere,
  basePredicted,
  queryPredicted,
  tickStepBp,
}: LinePairProps) => {
  const hoverChunk = useVisualizationStore((s) => s.hoverChunk);
  const setTooltip = useVisualizationStore((s) => s.setTooltip);
  const setHoverChunk = useVisualizationStore((s) => s.setHoverChunk);
  const sharedAxis = useVisualizationStore((s) => s.sharedAxis);
  const boundaryTicks = useVisualizationStore((s) => s.boundaryTicks);
  const showMarks = useVisualizationStore((s) => s.showMarks);
  const fontSize = useVisualizationStore((s) => s.fontSize);
  const palette = useAppStore((s) => s.palette);
  const batching = useAppStore((s) => s.batching);

  const { baseRow, queryRow, ribbons, y1bot, y2top } = layout;

  const onMove = useCallback(
    (_e: MouseEvent<SVGPathElement>, chunk: Chunk, rib: ChunkRibbon) => {
      if (batching) return;
      const ribbonMidX = PAD.left + (rib.bxs + rib.bxe) / 2;
      const topY = SVG_H + i * (CHROM_THICKNESS + ROW_GAP) + 13;
      setTooltip({ ribbonMidX, chunk, topY });
      setHoverChunk(chunk.id);
    },
    [setTooltip, setHoverChunk, i, batching]
  );

  const isFirst = i === 0;
  const isLast = i === total - 1;

  return (
    <Group left={PAD.left} top={i * (CHROM_THICKNESS + ROW_GAP)}>
      <RibbonLayer hoverChunk={hoverChunk} onMove={onMove} ribbons={ribbons} y1bot={y1bot} y2top={y2top} />
      <BaseRowLayer row={baseRow} noLine={!isFirst} palette={palette} fontSize={fontSize} />
      <QueryRowLayer row={queryRow} noLabel={!isLast} palette={palette} fontSize={fontSize} />
      {showMarks && isFirst && (
        <CentromereMarks bars={baseRow.bars} positions={baseCentromere} rowY={baseRow.y} />
      )}
      {showMarks && <CentromereMarks bars={queryRow.slots} positions={queryCentromere} rowY={queryRow.y} />}
      {showMarks && isFirst && (
        <CentromereMarks
          bars={baseRow.bars}
          positions={basePredicted}
          rowY={baseRow.y}
          color={PREDICTED_COLOR}
        />
      )}
      {showMarks && (
        <CentromereMarks
          bars={queryRow.slots}
          positions={queryPredicted}
          rowY={queryRow.y}
          color={PREDICTED_COLOR}
        />
      )}
      {sharedAxis && (
        <CoordinateGrid
          baseBars={baseRow.bars}
          queryBars={queryRow.slots.filter((s) => s.kind === "chr")}
          lineTop={baseRow.y - 4}
          lineBottom={queryRow.y + CHROM_THICKNESS + 4}
          labelTopY={isFirst ? baseRow.y - 6 : null}
          labelBottomY={isLast || boundaryTicks ? queryRow.y + CHROM_THICKNESS + 13 : null}
          nextBaseBars={isLast || !boundaryTicks ? undefined : nextLayout?.baseRow.bars}
          nextQueryBars={
            isLast || !boundaryTicks ? undefined : nextLayout?.queryRow.slots.filter((s) => s.kind === "chr")
          }
          fontSize={fontSize - 1}
          stepBp={tickStepBp}
        />
      )}
    </Group>
  );
};
