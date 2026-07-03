import { COLOR, TICK_INTERVAL_BP } from "@/src/constants";
import type { ChrBar } from "@/types";
import { bpToPx } from "@/src/components/visualizationTab/utils";

interface Tick {
  xTop: number;
  xBottom: number;
  label: string;
  key: string;
  drawLine: boolean;
  pw: number;
}

const MAX_TICK_OFFSET_FRAC = 0.1;

const collectTicks = (baseBars: ChrBar[], queryBars: ChrBar[]): Tick[] => {
  const queryByChr = new Map(queryBars.map((b) => [b.chr, b]));
  const sharedBars = baseBars.filter((b) => queryByChr.has(b.chr));
  if (!sharedBars.length) return [];

  const out: Tick[] = [];

  for (const baseBar of sharedBars) {
    const queryBar = queryByChr.get(baseBar.chr)!;
    const baseExtent = baseBar.dataBpLen ?? baseBar.bpLen;
    const queryExtent = queryBar.dataBpLen ?? queryBar.bpLen;
    const startBp = Math.ceil(Math.max(baseBar.p1, queryBar.p1) / TICK_INTERVAL_BP) * TICK_INTERVAL_BP;
    const endBp = Math.min(baseBar.p1 + baseExtent, queryBar.p1 + queryExtent);
    const refPw = Math.min(baseBar.pw, queryBar.pw);
    for (let bp = startBp; bp <= endBp; bp += TICK_INTERVAL_BP) {
      const xTop = bpToPx(baseBar, bp);
      const xBottom = bpToPx(queryBar, bp);
      const drawLine = refPw <= 0 || Math.abs(xTop - xBottom) / refPw <= MAX_TICK_OFFSET_FRAC;
      out.push({
        xTop,
        xBottom,
        label: `${bp / 1e6}M`,
        key: `${baseBar.chr}-${bp}`,
        drawLine,
        pw: refPw,
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
    if (!nt || !nt.drawLine) return true;
    const ref = Math.min(t.pw, nt.pw);
    if (ref <= 0) return false;
    return Math.abs(nt.xTop - t.xBottom) / ref > MAX_TICK_OFFSET_FRAC;
  });
};

interface TickLabelProps {
  ticks: Tick[];
  y: number;
  keyPrefix: string;
  side: "top" | "bottom";
}

const TickLabels = ({ ticks, y, keyPrefix, side }: TickLabelProps) => (
  <>
    {ticks.map((t) => (
      <text
        key={`${keyPrefix}-${t.key}`}
        x={side === "top" ? t.xTop : t.xBottom}
        y={y}
        fill={COLOR.muted}
        textAnchor="middle"
      >
        {t.label}
      </text>
    ))}
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
  nextBaseBars,
  nextQueryBars,
}: CoordinateGridProps) => {
  const ticks = collectTicks(baseBars, queryBars);
  if (!ticks.length) return null;
  const nextTicks = nextBaseBars && nextQueryBars ? collectTicks(nextBaseBars, nextQueryBars) : null;
  const bottomTicks = labelBottomY !== null ? bottomLabelTicks(ticks, nextTicks) : [];
  return (
    <g fontSize={fontSize}>
      {ticks.map((t) =>
        t.drawLine ? (
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
      {labelTopY !== null && <TickLabels ticks={ticks} y={labelTopY} keyPrefix="tt" side="top" />}
      {labelBottomY !== null && bottomTicks.length > 0 && (
        <TickLabels ticks={bottomTicks} y={labelBottomY + fontSize / 8} keyPrefix="tb" side="bottom" />
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
  nextBaseBars?: ChrBar[];
  nextQueryBars?: ChrBar[];
}
