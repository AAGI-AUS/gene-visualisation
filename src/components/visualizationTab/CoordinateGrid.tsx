import { FONT, TICK_INTERVAL_BP } from "@/src/constants";
import type { ChrBar } from "@/types";
import { bpToPx } from "@/src/components/visualizationTab/utils";

interface CoordinateGridProps {
  bars: ChrBar[];
  lineTop: number;
  lineBottom: number;
  labelTopY: number | null;
  labelBottomY: number | null;
  fontSize: number;
}

interface Tick {
  x: number;
  label: string;
  key: string;
}

const collectTicks = (bars: ChrBar[]): Tick[] => {
  const out: Tick[] = [];
  for (const bar of bars) {
    const endBp = bar.p1 + bar.bpLen;
    const startTickBp = Math.ceil(bar.p1 / TICK_INTERVAL_BP) * TICK_INTERVAL_BP;
    for (let bp = startTickBp; bp <= endBp; bp += TICK_INTERVAL_BP) {
      out.push({
        x: bpToPx(bar, bp),
        label: `${bp / 1_000_000}M`,
        key: `${bar.chr}-${bp}`,
      });
    }
  }
  return out;
};

interface TickLabelProps {
  ticks: Tick[];
  y: number;
  keyPrefix: string;
  fontSize: number;
}

const TickLabels = ({ ticks, y, keyPrefix, fontSize }: TickLabelProps) => (
  <>
    {ticks.map((t) => (
      <text
        key={`${keyPrefix}-${t.key}`}
        x={t.x}
        y={y}
        fontSize={fontSize}
        fontFamily={FONT}
        fill="grey"
        textAnchor="middle"
      >
        {t.label}
      </text>
    ))}
  </>
);

export const CoordinateGrid = ({
  bars,
  lineTop,
  lineBottom,
  labelTopY,
  labelBottomY,
  fontSize,
}: CoordinateGridProps) => {
  const ticks = collectTicks(bars);
  if (!ticks.length) return null;
  return (
    <g>
      {ticks.map((t) => (
        <line
          key={`l-${t.key}`}
          x1={t.x}
          x2={t.x}
          y1={lineTop}
          y2={lineBottom}
          stroke="grey"
          strokeWidth={0.5}
          strokeDasharray="5 3"
        />
      ))}
      {labelTopY !== null && <TickLabels ticks={ticks} y={labelTopY} keyPrefix="tt" fontSize={fontSize} />}
      {labelBottomY !== null && <TickLabels ticks={ticks} y={labelBottomY} keyPrefix="tb" fontSize={fontSize} />}
    </g>
  );
};
