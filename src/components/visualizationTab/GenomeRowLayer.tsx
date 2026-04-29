import { CHR_PALETTE, CHROM_THICKNESS, FONT, OTHERS_COL } from "@/src/constants";
import type { BaseRow, QueryRow } from "@/types";

type SVGTextProps = React.SVGTextElementAttributes<SVGTextElement>;

function SVGText({ children, ...props }: SVGTextProps) {
  return (
    <text textAnchor="middle" fontFamily={FONT} {...props}>
      {children}
    </text>
  );
}

type LineLabelProps = SVGTextProps & { y: number; text: string };

function LineLabel({ y, text, ...props }: LineLabelProps) {
  return (
    <SVGText x={-10} y={y + CHROM_THICKNESS / 2 + 4} textAnchor="end" fontSize={11} fill="#64748b" {...props}>
      {text}
    </SVGText>
  );
}

type HorizontalLineProps = React.SVGLineElementAttributes<SVGLineElement> & {
  x: number;
  width: number;
  y: number;
};

function HorizontalLine({ x, width, y, ...props }: HorizontalLineProps) {
  const yCalc = y + CHROM_THICKNESS / 2;
  const minWidth = Math.max(width, 1);
  return <line x1={x} x2={x + minWidth} y1={yCalc} y2={yCalc} strokeWidth={CHROM_THICKNESS} {...props} />;
}

interface BaseRowLayerProps {
  row: BaseRow;
}

export function BaseRowLayer({ row }: BaseRowLayerProps) {
  return (
    <g>
      <LineLabel y={row.y} text={row.label} />
      {row.bars.map((bar) => (
        <g key={bar.chr}>
          <HorizontalLine x={bar.px} width={bar.pw} y={row.y} stroke={CHR_PALETTE[bar.colorIdx]} />
          {bar.pw > 24 && (
            <SVGText x={bar.px + bar.pw / 2} y={row.y - 7} fontSize={9} fill={CHR_PALETTE[bar.colorIdx]}>
              {bar.chr}
            </SVGText>
          )}
        </g>
      ))}
    </g>
  );
}

interface QueryRowLayerProps {
  row: QueryRow;
}

export function QueryRowLayer({ row }: QueryRowLayerProps) {
  return (
    <g>
      <LineLabel y={row.y} text={row.label} />
      {row.slots.map((slot, si) => {
        let key: string;
        let col: string;
        let dash: string;
        let label: string;
        if (slot.kind === "chr") {
          key = slot.chr;
          col = CHR_PALETTE[slot.colorIdx];
          label = slot.chr;
          dash = "none";
        } else {
          key = `others-${slot.side}-${si}`;
          col = OTHERS_COL;
          dash = "3 2";
          label = "others";
        }

        return (
          <g key={key}>
            <HorizontalLine x={slot.px} width={slot.pw} y={row.y} stroke={col} strokeDasharray={dash} />
            {(slot.pw > 24 || slot.kind === "others") && (
              <SVGText x={slot.px + slot.pw / 2} y={row.y + CHROM_THICKNESS + 14} fontSize={9} fill={col}>
                {label}
              </SVGText>
            )}
          </g>
        );
      })}
    </g>
  );
}
