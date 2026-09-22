import { COLOR } from "@/src/constants";
import type { Tick } from "@/types";
import { MAX_TICK_OFFSET_FRAC } from "@/src/components/visualizationTab/utils";

const TICK_MARK_PX = 8;

const bottomLabelTicks = (ticks: Tick[], nextTicks: Tick[] | null): Tick[] => {
  if (!nextTicks) return ticks;
  const nextByKey = new Map(nextTicks.map((t) => [t.key, t]));
  return ticks.filter((t) => {
    const nt = nextByKey.get(t.key);
    if (!nt || !nt.drawLine || nt.xTop === undefined || t.xBottom === undefined) return true;
    const ref = Math.min(t.pw, nt.pw);
    if (ref <= 0) return false;
    return Math.abs(nt.xTop - t.xBottom) / ref > MAX_TICK_OFFSET_FRAC;
  });
};

interface TickAxisProps {
  ticks: Tick[];
  labelY: number;
  markY: number;
  side: "top" | "bottom";
}

const TickAxis = ({ ticks, labelY, markY, side }: TickAxisProps) => (
  <>
    {ticks.map((t) => {
      const x = side === "top" ? t.xTop : t.xBottom;
      if (x === undefined) return null;

      const y1 = side === "top" ? markY : markY - TICK_MARK_PX;
      return (
        <g key={`${side}-${t.key}`}>
          {!t.drawLine && <line x1={x} x2={x} y1={y1} y2={y1 + TICK_MARK_PX} stroke="grey" strokeWidth={0.5} />}
          <text x={x} y={labelY} fill={COLOR.muted} textAnchor="middle">
            {t.label}
          </text>
        </g>
      );
    })}
  </>
);

export const CoordinateGrid = ({
  ticks,
  nextTicks,
  lineTop,
  lineBottom,
  labelTopY,
  labelBottomY,
  fontSize,
}: CoordinateGridProps) => {
  if (!ticks.length) return null;
  const bottomTicks = labelBottomY !== null ? bottomLabelTicks(ticks, nextTicks) : [];
  return (
    <g fontSize={fontSize}>
      {ticks.map((t) =>
        t.drawLine && t.xTop !== undefined && t.xBottom !== undefined ? (
          <line
            key={`l-${t.key}`}
            x1={t.xTop}
            x2={t.xBottom}
            y1={lineTop}
            y2={lineBottom}
            stroke="grey"
            strokeWidth={0.5}
            strokeDasharray="5 3"
          />
        ) : null
      )}
      {labelTopY !== null && <TickAxis ticks={ticks} labelY={labelTopY} markY={lineTop} side="top" />}
      {labelBottomY !== null && bottomTicks.length > 0 && (
        <TickAxis ticks={bottomTicks} labelY={labelBottomY + fontSize / 8} markY={lineBottom} side="bottom" />
      )}
    </g>
  );
};

interface CoordinateGridProps {
  ticks: Tick[];
  nextTicks: Tick[] | null;
  lineTop: number;
  lineBottom: number;
  labelTopY: number | null;
  labelBottomY: number | null;
  fontSize: number;
}
