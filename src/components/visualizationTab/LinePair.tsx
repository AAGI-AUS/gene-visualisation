import { useCallback, type MouseEvent } from "react";
import { PAD, SVG_H } from "@/src/constants";
import type { Chunk, ChunkRibbon, ResultRow } from "@/types";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { RibbonLayer } from "@/src/components/visualizationTab/RibbonLayer";
import { BaseRowLayer, QueryRowLayer } from "@/src/components/visualizationTab/GenomeRowLayer";
import { useAppStore } from "@/src/store/useAppStore";
import { useVisualizationLayout } from "@/src/store/useVisualizationLayout";
import { Group } from "@visx/group";

interface LinePairProps {
  data: ResultRow[];
  queryName: string;
  i: number;
}

export function LinePair({ data, queryName, i }: LinePairProps) {
  const base = useAppStore((s) => s.base);
  const svgW = useVisualizationStore((s) => s.svgW);
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);
  const hoverChunk = useVisualizationStore((s) => s.hoverChunk);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const setTooltip = useVisualizationStore((s) => s.setTooltip);
  const setHoverChunk = useVisualizationStore((s) => s.setHoverChunk);

  const layout = useVisualizationLayout(
    data,
    i === 0 ? (base?.name ?? "") : "",
    queryName,
    svgW - PAD.left - PAD.right,
    gapBp,
    othersMode,
    hiddenThreshold
  );

  const onMove = useCallback(
    (_e: MouseEvent<SVGPathElement>, ch: Chunk, rib: ChunkRibbon) => {
      // Centre tooltip on the ribbon's midpoint (in canvas-space px)
      const ribbonMidX = PAD.left + (rib.bxs + rib.bxe) / 2;
      setTooltip({ ribbonMidX, chunk: ch });
      setHoverChunk(ch.id);
    },
    [setTooltip, setHoverChunk]
  );

  return (
    <Group left={PAD.left} top={i * (SVG_H - PAD.top)}>
      <RibbonLayer
        ribbons={layout.ribbons}
        y1bot={layout.y1bot}
        y2top={layout.y2top}
        hoverChunk={hoverChunk}
        othersMode={othersMode}
        onMove={onMove}
      />
      <BaseRowLayer row={layout.baseRow} />
      <QueryRowLayer row={layout.queryRow} />
    </Group>
  );
}
