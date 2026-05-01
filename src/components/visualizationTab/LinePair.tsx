import { useCallback, useEffect, type MouseEvent } from "react";
import { PAD, SVG_H } from "@/src/constants";
import type { Chunk, ChunkRibbon, ResultRow } from "@/types";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { RibbonLayer } from "@/src/components/visualizationTab/RibbonLayer";
import { BaseRowLayer, QueryRowLayer } from "@/src/components/visualizationTab/GenomeRowLayer";
import { useAppStore } from "@/src/store/useAppStore";
import { Group } from "@visx/group";
import { useVisualizationLayout } from "@/src/hooks/useVisualizationLayout";

interface LinePairProps {
  data: ResultRow[];
  queryName: string;
  i: number;
}

export const LinePair = ({ data, queryName, i }: LinePairProps) => {
  const base = useAppStore((s) => s.base);
  const baseRows = useVisualizationStore((s) => s.baseRows);
  const svgW = useVisualizationStore((s) => s.svgW);
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);
  const hoverChunk = useVisualizationStore((s) => s.hoverChunk);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const setBaseRows = useVisualizationStore((s) => s.setBaseRows);
  const setTooltip = useVisualizationStore((s) => s.setTooltip);
  const setHoverChunk = useVisualizationStore((s) => s.setHoverChunk);

  const { baseRow, queryRow, ...layout } = useVisualizationLayout(
    data,
    i === 0 ? (base?.name.split(".")[0] ?? "") : "",
    queryName.split(".")[0],
    svgW - PAD.left - PAD.right,
    gapBp,
    othersMode,
    hiddenThreshold,
    i > 0 ? baseRows[i - 1] : undefined
  );

  useEffect(() => {
    setBaseRows(i, baseRow, queryRow);
  }, [baseRow, queryRow]);

  const onMove = useCallback(
    (_e: MouseEvent<SVGPathElement>, chunk: Chunk, rib: ChunkRibbon) => {
      // Centre tooltip on the ribbon's midpoint (in canvas-space px)
      const ribbonMidX = PAD.left + (rib.bxs + rib.bxe) / 2;
      const topY = (i + 1) * SVG_H - i * PAD.top + 21;
      setTooltip({ ribbonMidX, chunk, topY });
      setHoverChunk(chunk.id);
    },
    [setTooltip, setHoverChunk]
  );

  return (
    <Group left={PAD.left} top={i * (SVG_H - PAD.top)}>
      <RibbonLayer hoverChunk={hoverChunk} othersMode={othersMode} onMove={onMove} {...layout} />
      <BaseRowLayer row={baseRow} noLine={i > 0} />
      <QueryRowLayer row={queryRow} />
    </Group>
  );
};
