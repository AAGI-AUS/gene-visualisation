import { COLOR } from "@/src/constants";
import type { ChrBar } from "@/types";
import { bpToPx, formatBpLabel } from "@/src/components/visualizationTab/utils";

interface Tick {
  xTop?: number;
  xBottom?: number;
  label: string;
  key: string;
  drawLine: boolean;
  pw: number;
}

const MAX_TICK_OFFSET_FRAC = 0.1;
const MAX_TICKS_PER_BAR = 1000;
const TICK_MARK_PX = 8;

const inRange = (bar: ChrBar, bp: number) => bp >= bar.p1 && bp <= bar.p1 + bar.bpLen;

const barTicks = (bar: ChrBar, stepBp: number): { bp: number; x: number }[] => {
  const startBp = Math.ceil(bar.p1 / stepBp) * stepBp;
  const count = Math.min(Math.floor((bar.p1 + bar.bpLen - startBp) / stepBp) + 1, MAX_TICKS_PER_BAR);
  const out: { bp: number; x: number }[] = [];
  for (let i = 0; i < count; i++) {
    const bp = startBp + i * stepBp;
    out.push({ bp, x: bpToPx(bar, bp) });
  }
  return out;
};

// Ticks come from each bar's own extent, then pair up by chr + bp: a bp on both sides can carry a
// connector, one on a single side still carries a mark and a label on that side.
const collectTicks = (baseBars: ChrBar[], queryBars: ChrBar[], stepBp: number, connect: boolean): Tick[] => {
  const baseByChr = new Map(baseBars.map((b) => [b.chr, b]));
  const queryByChr = new Map(queryBars.map((b) => [b.chr, b]));
  const out: Tick[] = [];

  for (const baseBar of baseBars) {
    const queryBar = queryByChr.get(baseBar.chr);
    for (const { bp, x } of barTicks(baseBar, stepBp)) {
      const pairedBar = queryBar && inRange(queryBar, bp) ? queryBar : undefined;
      const xBottom = pairedBar ? bpToPx(pairedBar, bp) : undefined;
      const pw = pairedBar ? Math.min(baseBar.pw, pairedBar.pw) : baseBar.pw;
      const drawLine =
        connect && xBottom !== undefined && (pw <= 0 || Math.abs(x - xBottom) / pw <= MAX_TICK_OFFSET_FRAC);
      out.push({ xTop: x, xBottom, label: formatBpLabel(bp), key: `${baseBar.chr}-${bp}`, drawLine, pw });
    }
  }

  for (const queryBar of queryBars) {
    const baseBar = baseByChr.get(queryBar.chr);
    for (const { bp, x } of barTicks(queryBar, stepBp)) {
      if (baseBar && inRange(baseBar, bp)) continue;
      out.push({
        xBottom: x,
        label: formatBpLabel(bp),
        key: `${queryBar.chr}-${bp}`,
        drawLine: false,
        pw: queryBar.pw,
      });
    }
  }

  return out;
};

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
  markFrom: number;
  markTo: number;
  keyPrefix: string;
  side: "top" | "bottom";
}

// A tick whose connector was suppressed still gets a short mark through the bar, so no label floats
// free of the axis it belongs to.
const TickAxis = ({ ticks, labelY, markFrom, markTo, keyPrefix, side }: TickAxisProps) => (
  <>
    {ticks.map((t) => {
      const x = side === "top" ? t.xTop : t.xBottom;
      if (x === undefined) return null;
      return (
        <g key={`${keyPrefix}-${t.key}`}>
          {!t.drawLine && <line x1={x} x2={x} y1={markFrom} y2={markTo} stroke="grey" strokeWidth={0.5} />}
          <text x={x} y={labelY} fill={COLOR.muted} textAnchor="middle">
            {t.label}
          </text>
        </g>
      );
    })}
  </>
);

export const CoordinateGrid = ({
  baseBars,
  queryBars,
  lineTop,
  lineBottom,
  labelTopY,
  labelBottomY,
  fontSize,
  stepBp,
  connect,
  nextConnect,
  nextBaseBars,
  nextQueryBars,
}: CoordinateGridProps) => {
  const ticks = collectTicks(baseBars, queryBars, stepBp, connect);
  if (!ticks.length) return null;
  const nextTicks =
    nextBaseBars && nextQueryBars ? collectTicks(nextBaseBars, nextQueryBars, stepBp, !!nextConnect) : null;
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
      {labelTopY !== null && (
        <TickAxis
          ticks={ticks}
          labelY={labelTopY}
          markFrom={lineTop}
          markTo={lineTop + TICK_MARK_PX}
          keyPrefix="tt"
          side="top"
        />
      )}
      {labelBottomY !== null && bottomTicks.length > 0 && (
        <TickAxis
          ticks={bottomTicks}
          labelY={labelBottomY + fontSize / 8}
          markFrom={lineBottom - TICK_MARK_PX}
          markTo={lineBottom}
          keyPrefix="tb"
          side="bottom"
        />
      )}
    </g>
  );
};

interface CoordinateGridProps {
  baseBars: ChrBar[];
  queryBars: ChrBar[];
  lineTop: number;
  lineBottom: number;
  labelTopY: number | null;
  labelBottomY: number | null;
  fontSize: number;
  stepBp: number;
  // Connectors are drawn only between rows on the same scale; a scale break gets marks and labels.
  connect: boolean;
  nextConnect?: boolean;
  nextBaseBars?: ChrBar[];
  nextQueryBars?: ChrBar[];
}
