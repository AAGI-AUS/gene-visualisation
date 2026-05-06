import { useCallback, type MouseEvent } from "react";
import { PAD, SVG_H } from "@/src/constants";
import type { Chunk, ChunkRibbon } from "@/types";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { RibbonLayer } from "@/src/components/visualizationTab/RibbonLayer";
import { BaseRowLayer, QueryRowLayer } from "@/src/components/visualizationTab/GenomeRowLayer";
import { useAppStore } from "@/src/store/useAppStore";
import { Group } from "@visx/group";
import type { VisualizationLayout } from "@/src/hooks/useVisualizationLayout";

interface LinePairProps {
  layout: VisualizationLayout;
  i: number;
}

export const LinePair = ({ layout, i }: LinePairProps) => {
  const hoverChunk = useVisualizationStore((s) => s.hoverChunk);
  const setTooltip = useVisualizationStore((s) => s.setTooltip);
  const setHoverChunk = useVisualizationStore((s) => s.setHoverChunk);
  const palette = useAppStore((s) => s.palette);

  const { baseRow, queryRow, ribbons, y1bot, y2top } = layout;

  const onMove = useCallback(
    (_e: MouseEvent<SVGPathElement>, chunk: Chunk, rib: ChunkRibbon) => {
      const ribbonMidX = PAD.left + (rib.bxs + rib.bxe) / 2;
      const topY = (i + 1) * SVG_H - i * PAD.top + 13;
      setTooltip({ ribbonMidX, chunk, topY });
      setHoverChunk(chunk.id);
    },
    [setTooltip, setHoverChunk, i]
  );

  return (
    <Group left={PAD.left} top={i * (SVG_H - PAD.top)}>
      <RibbonLayer hoverChunk={hoverChunk} onMove={onMove} ribbons={ribbons} y1bot={y1bot} y2top={y2top} />
      <BaseRowLayer row={baseRow} noLine={i > 0} palette={palette} />
      <QueryRowLayer row={queryRow} palette={palette} />
    </Group>
  );
};
