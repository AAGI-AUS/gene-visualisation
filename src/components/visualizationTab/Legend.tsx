import { Group } from "@visx/group";
import { CHUNK_COLOR, COLOR, LEGEND_H, chunkEvents } from "@/src/constants";
import type { ChunkEvent } from "@/src/constants";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";

const ITEM_LABEL: Record<ChunkEvent, string> = {
  synteny: "Synteny",
  inversion: "Inversion",
  translocation: "Translocation",
  "translocation+inversion": "Translocation + inversion",
};

interface LegendProps {
  width: number;
  fontSize: number;
}

const CROSS_ITEMS = [
  { color: "red", label: "Known centromere" },
  { color: "blue", label: "Synteny-based centromere" },
];

export const Legend = ({ width, fontSize }: LegendProps) => {
  const showMarks = useVisualizationStore((s) => s.showMarks);
  const swatch = Math.max(11, fontSize - 2);
  const swatchGap = fontSize * 0.45;
  const textX = swatch + swatchGap;
  const itemGap = 8;
  const charW = fontSize * 0.6;

  const items = [
    ...chunkEvents.map((event) => ({
      kind: "swatch" as const,
      color: CHUNK_COLOR[event],
      label: ITEM_LABEL[event],
    })),
    ...(showMarks ? CROSS_ITEMS.map((it) => ({ kind: "cross" as const, ...it })) : []),
  ].map((item) => ({ ...item, w: swatch + swatchGap + item.label.length * charW }));

  const total = items.reduce((sum, item) => sum + item.w, 0) + itemGap * (items.length - 1);
  const midY = LEGEND_H / 2;
  const h = swatch / 2;
  const xSizeOffset = 2;
  const xH = h - xSizeOffset / 2;

  let cursor = (width - total) / 2;

  return (
    <Group top={0} left={0}>
      {items.map((item) => {
        const x = cursor;
        cursor += item.w + itemGap;
        return (
          <Group key={item.label} left={x} top={0}>
            {item.kind === "swatch" ? (
              <rect x={0} y={midY - h} width={swatch} height={swatch} fill={item.color} rx={2} />
            ) : (
              <g stroke={item.color} strokeWidth={1} strokeLinecap="square">
                <line x1={0} x2={swatch - xSizeOffset} y1={midY - xH} y2={midY + xH} />
                <line x1={0} x2={swatch - xSizeOffset} y1={midY + xH} y2={midY - xH} />
              </g>
            )}
            <text x={textX} y={midY} dominantBaseline="central" fontSize={fontSize} fill={COLOR.muted}>
              {item.label}
            </text>
          </Group>
        );
      })}
    </Group>
  );
};
