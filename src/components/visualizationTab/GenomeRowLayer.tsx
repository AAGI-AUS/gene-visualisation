import { BAR_H, CHR_PALETTE, FONT, OTHERS_COL } from "@/src/constants";
import type { BaseRow, QueryRow } from "@/types";

interface BaseRowLayerProps {
  row: BaseRow;
}

export function BaseRowLayer({ row }: BaseRowLayerProps) {
  return (
    <g>
      <text x={-10} y={row.y + BAR_H / 2 + 4} textAnchor="end" fontSize={11} fontFamily={FONT} fill="#64748b">
        {row.label}
      </text>
      {row.bars.map((bar) => {
        const col = CHR_PALETTE[bar.colorIdx];
        return (
          <g key={bar.chr}>
            <rect
              x={bar.px}
              y={row.y}
              width={Math.max(bar.pw, 1)}
              height={BAR_H}
              fill={col}
              fillOpacity={0.12}
              stroke={col}
              strokeWidth={1.2}
              strokeOpacity={0.55}
              rx={2}
            />
            {bar.pw > 24 && (
              <text
                x={bar.px + bar.pw / 2}
                y={row.y - 7}
                textAnchor="middle"
                fontSize={9}
                fontFamily={FONT}
                fill={col}
                fillOpacity={0.8}
              >
                {bar.chr}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

interface QueryRowLayerProps {
  row: QueryRow;
}

export function QueryRowLayer({ row }: QueryRowLayerProps) {
  return (
    <g>
      <text x={-10} y={row.y + BAR_H / 2 + 4} textAnchor="end" fontSize={11} fontFamily={FONT} fill="#64748b">
        {row.label}
      </text>
      {row.slots.map((slot, si) => {
        if (slot.kind === "chr") {
          const col = CHR_PALETTE[slot.colorIdx];
          return (
            <g key={slot.chr}>
              <rect
                x={slot.px}
                y={row.y}
                width={Math.max(slot.pw, 1)}
                height={BAR_H}
                fill={col}
                fillOpacity={0.12}
                stroke={col}
                strokeWidth={1.2}
                strokeOpacity={0.55}
                rx={2}
              />
              {slot.pw > 24 && (
                <text
                  x={slot.px + slot.pw / 2}
                  y={row.y + BAR_H + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily={FONT}
                  fill={col}
                  fillOpacity={0.8}
                >
                  {slot.chr}
                </text>
              )}
            </g>
          );
        }
        return (
          <g key={`others-${slot.side}-${si}`}>
            <rect
              x={slot.px}
              y={row.y}
              width={slot.pw}
              height={BAR_H}
              fill={OTHERS_COL}
              fillOpacity={0.1}
              stroke={OTHERS_COL}
              strokeWidth={1}
              strokeOpacity={0.4}
              strokeDasharray="3 2"
              rx={2}
            />
            <text
              x={slot.px + slot.pw / 2}
              y={row.y + BAR_H + 14}
              textAnchor="middle"
              fontSize={8}
              fontFamily={FONT}
              fill={OTHERS_COL}
              fillOpacity={0.8}
            >
              others
            </text>
          </g>
        );
      })}
    </g>
  );
}
