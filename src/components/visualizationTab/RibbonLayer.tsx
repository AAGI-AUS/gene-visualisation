import { type MouseEvent } from "react";
import { CHUNK_COLOR, CHUNK_OPACITY } from "@/src/constants";
import type { Chunk, ChunkRibbon } from "@/types";
import { ribbonPath } from "@/src/components/visualizationTab/utils";

interface RibbonLayerProps {
  ribbons: ChunkRibbon[];
  y1bot: number;
  y2top: number;
  hoverChunk: string | null;
  othersMode: boolean;
  onMove: (e: MouseEvent<SVGPathElement>, chunk: Chunk) => void;
}

export function RibbonLayer({ ribbons, y1bot, y2top, hoverChunk, othersMode, onMove }: RibbonLayerProps) {
  return (
    <g>
      {ribbons.map(({ chunk: ch, bxs, bxe, qxs, qxe }) => {
        const hot = hoverChunk === ch.id;
        const dimmed = hoverChunk !== null && !hot;
        const isOth = othersMode && ch.isOthers;
        const color = CHUNK_COLOR[ch.dominant];
        const baseOp = isOth ? 0.28 : CHUNK_OPACITY[ch.dominant];
        const op = hot ? 0.68 : dimmed ? baseOp * 0.15 : baseOp;

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
            onMouseMove={(e) => onMove(e, ch)}
          />
        );
      })}
    </g>
  );
}
