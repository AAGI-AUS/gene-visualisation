import type { MouseEvent } from "react";
import { CHUNK_COLOR } from "@/src/constants";
import type { Chunk, ChunkRibbon } from "@/types";
import { ribbonPath } from "@/src/components/visualizationTab/utils";

interface RibbonLayerProps {
  ribbons: ChunkRibbon[];
  y1bot: number;
  y2top: number;
  hoverChunk: string | null;
  onMove: (e: MouseEvent<SVGPathElement>, chunk: Chunk, rib: ChunkRibbon) => void;
}

export const RibbonLayer = ({ ribbons, y1bot, y2top, hoverChunk, onMove }: RibbonLayerProps) => (
  <g>
    {ribbons.map((rib) => {
      const { chunk: ch, bxs, bxe, qxs, qxe } = rib;
      const hot = hoverChunk === ch.id;
      const dimmed = hoverChunk !== null && !hot;
      const color = CHUNK_COLOR[ch.dominant];
      const baseOp = 0.34;
      const op = dimmed ? baseOp * 0.34 : baseOp;

      return (
        <path
          key={ch.id}
          d={ribbonPath(bxs, bxe, y1bot, qxs, qxe, y2top)}
          fill={color}
          fillOpacity={op}
          stroke={hot ? color : "none"}
          strokeWidth={hot ? 1 : 0}
          strokeOpacity={op}
          style={{ cursor: "pointer" }}
          onMouseMove={(e) => onMove(e, ch, rib)}
        />
      );
    })}
  </g>
);
