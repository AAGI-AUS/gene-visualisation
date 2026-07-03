import { SVGText } from "@/src/components/base/svg";
import { CHROM_THICKNESS, COLOR, LINE_LABEL_GAP, OTHERS_COL } from "@/src/constants";
import type { BaseRow, QueryRow } from "@/types";

interface LineLabelProps extends React.SVGProps<SVGTextElement> {
  y: number;
  text: string;
}

const LineLabel = ({ y, text, ...props }: LineLabelProps) => (
  <SVGText
    t={text}
    x={-LINE_LABEL_GAP}
    y={y + CHROM_THICKNESS / 2 + 4}
    textAnchor="end"
    fill={COLOR.muted}
    {...props}
  />
);

type ChromLabelProps = LineLabelProps & { bg?: string };

const ChromLabel = ({ y, text, fill = "white", bg = "black", ...props }: ChromLabelProps) => {
  const x = Number(props.x) || 0;
  const fontSize = Number(props.fontSize) || 10;
  const yCalc = y + CHROM_THICKNESS / 2 + Math.round((1 / 3) * fontSize - 2 / 3);
  const size = fontSize + 4;
  const width = size + Math.round((1 / 6) * fontSize - 5 / 6);
  const height = fontSize + 2;
  return (
    <g>
      <rect x={x - size / 2} y={yCalc - fontSize * 0.85 - 1} width={width} height={height} fill={bg} />
      <SVGText t={text} y={yCalc} textAnchor="middle" fill={fill} {...props} />
    </g>
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
  palette: Record<string, string>;
  fontSize: number;
}

export const BaseRowLayer = ({ row, noLine, palette, fontSize }: BaseRowLayerProps) => (
  <g>
    <LineLabel y={row.y} text={row.label} fontSize={fontSize + 2} />
    {row.bars.map(({ chr, px, pw }) => (
      <g key={chr}>
        {!noLine && <HorizontalLine x={px} width={pw} y={row.y} stroke={palette[chr]} />}
        {pw > 24 && (
          <ChromLabel x={px + 11} y={row.y} fill="white" bg={palette[chr]} text={chr} fontSize={fontSize} />
        )}
      </g>
    ))}
  </g>
);

interface QueryRowLayerProps {
  row: QueryRow;
  noLabel?: boolean;
  palette: Record<string, string>;
  fontSize: number;
}

export const QueryRowLayer = ({ row, noLabel, palette, fontSize }: QueryRowLayerProps) => (
  <g>
    <LineLabel y={row.y} text={row.label} fontSize={fontSize + 2} />
    {row.slots.map((slot, si) => {
      let key: string;
      let col: string;
      let dash: string;
      let label: string;
      if (slot.kind === "chr") {
        key = slot.chr;
        col = palette[slot.chr];
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
          {!noLabel && (slot.pw > 24 || slot.kind === "others") && (
            <ChromLabel x={slot.px + 11} y={row.y} bg={col} text={label} fontSize={fontSize} />
          )}
        </g>
      );
    })}
  </g>
);
