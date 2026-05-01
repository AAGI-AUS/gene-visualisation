import { CHR_PALETTE, CHROM_THICKNESS, FONT, OTHERS_COL } from "@/src/constants";
import type { BaseRow, QueryRow } from "@/types";

type SVGTextProps = React.SVGTextElementAttributes<SVGTextElement>;

const SVGText = ({ children, ...props }: SVGTextProps) => (
  <text textAnchor="middle" fontFamily={FONT} {...props}>
    {children}
  </text>
);
type LineLabelProps = SVGTextProps & { y: number; text: string };

const LineLabel = ({ y, text, ...props }: LineLabelProps) => (
  <SVGText x={-10} y={y + CHROM_THICKNESS / 2 + 4} textAnchor="end" fontSize={11} fill="#64748b" {...props}>
    {text}
  </SVGText>
);

const ChromLabel = ({ y, text, ...props }: LineLabelProps) => {
  const yCalc = y + CHROM_THICKNESS / 2 + 3;
  return (
    <SVGText y={yCalc} fontSize={11} stroke="white" strokeWidth={3} paintOrder="stroke" {...props}>
      {text}
    </SVGText>
  );
};

type HorizontalLineProps = React.SVGLineElementAttributes<SVGLineElement> & {
  x: number;
  width: number;
  y: number;
};

const HorizontalLine = ({ x, width, y, ...props }: HorizontalLineProps) => {
  const yCalc = y + CHROM_THICKNESS / 2;
  const minWidth = Math.max(width, 1);
  return <line x1={x} x2={x + minWidth} y1={yCalc} y2={yCalc} strokeWidth={CHROM_THICKNESS} {...props} />;
};

interface BaseRowLayerProps {
  row: BaseRow;
  noLine?: boolean;
}

export const BaseRowLayer = ({ row, noLine }: BaseRowLayerProps) => (
  <g>
    <LineLabel y={row.y} text={row.label} />
    {row.bars.map((bar) => (
      <g key={bar.chr}>
        {!noLine && <HorizontalLine x={bar.px} width={bar.pw} y={row.y} stroke={CHR_PALETTE[bar.colorIdx]} />}
        {bar.pw > 24 && (
          <ChromLabel x={bar.px + bar.pw / 2} y={row.y} fill={CHR_PALETTE[bar.colorIdx]} text={bar.chr} />
        )}
      </g>
    ))}
  </g>
);

interface QueryRowLayerProps {
  row: QueryRow;
}

export const QueryRowLayer = ({ row }: QueryRowLayerProps) => (
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
        label = "O";
      }

      return (
        <g key={key}>
          <HorizontalLine x={slot.px} width={slot.pw} y={row.y} stroke={col} strokeDasharray={dash} />
          {(slot.pw > 24 || slot.kind === "others") && (
            <ChromLabel x={slot.px + slot.pw / 2} y={row.y} fill={col} text={label} />
          )}
        </g>
      );
    })}
  </g>
);
