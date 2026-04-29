import { Chunk } from "@/types";
import styles from "./VisualizationTab.module.css";
import { CHUNK_COLOR, ChunkEvent, OTHERS_COL } from "@/src/constants";
import { DistributionRow } from "@/src/components/visualizationTab/DistributionRow";

const TOOLTIP_W = 300;
const TOOLTIP_PAD = 16; // px from canvas edge

function parseChromCounts(queryChromCounts: Record<string, number>, total: number) {
  const rest: [string, number][] = [];
  let others = 0;

  for (const [chromosome, count] of Object.entries(queryChromCounts)) {
    if (count / total < 0.05) others += count;
    else rest.push([chromosome, count]);
  }

  rest.sort(([, a], [, b]) => b - a);
  if (others > 0) rest.push(["Others", others]);

  return rest;
}

interface ChunkTooltipProps {
  chunk: Chunk;
  /** SVG canvas-space x of the ribbon midpoint */
  ribbonMidX: number;
  /** px from canvasWrap top to the tooltip's top edge */
  topY: number;
  /** Total canvas width (px), used to clamp horizontal position */
  canvasW: number;
}

const EVENTS: Array<{ key: ChunkEvent; label: string }> = [
  { key: "synteny", label: "Synteny" },
  { key: "inversion", label: "Inversion" },
  { key: "translocation", label: "Translocation" },
  { key: "translocation+inversion", label: "Trans+Inv" },
];

export function ChunkTooltip({ chunk, ribbonMidX, topY, canvasW }: ChunkTooltipProps) {
  const {
    chrBase,
    bp1Base,
    bp2Base,
    bpGeneBase,
    chrQuery,
    bp1Query,
    bp2Query,
    bpGeneQuery,
    dominant,
    eventCounts,
    queryChromCounts,
    isOthers,
  } = chunk;

  // Horizontally centre on the ribbon, clamped to canvas bounds
  const rawLeft = ribbonMidX - TOOLTIP_W / 2;
  const clampedLeft = Math.min(Math.max(rawLeft, TOOLTIP_PAD), canvasW - TOOLTIP_W - TOOLTIP_PAD);

  // Derived stats
  const baseSpan = bp2Base - bp1Base;
  const querySpan = isOthers ? null : bp2Query - bp1Query;

  return (
    <div className={styles.tooltip} style={{ left: clampedLeft, top: topY, position: "absolute" }}>
      {/* Colour accent bar matching dominant event */}
      <div className={styles.tooltipAccent} style={{ background: CHUNK_COLOR[dominant] }} />

      <div className={styles.tooltipInner}>
        {/* Header: dominant event + gene count */}
        <div className={styles.tooltipHeader}>
          <span className={styles.tooltipDominant} style={{ color: CHUNK_COLOR[dominant] }}>
            {dominant}
            {isOthers ? " · others" : ""}
          </span>
          <span className={styles.tooltipCount}>{eventCounts.total} genes</span>
        </div>

        {/* Coordinates */}
        <div className={styles.tooltipCoord}>
          <span className={styles.tooltipGenome}>base</span>
          <span>
            {chrBase}:{bp1Base.toLocaleString()}–{bp2Base.toLocaleString()}
          </span>
        </div>

        {isOthers ? (
          <div className={styles.tooltipCoord}>
            <span className={styles.tooltipGenome}>query</span>
            <span style={{ color: OTHERS_COL }}>grouped → others</span>
          </div>
        ) : chrQuery ? (
          <div className={styles.tooltipCoord}>
            <span className={styles.tooltipGenome}>query</span>
            <span>
              {chrQuery}:{bp1Query.toLocaleString()}–{bp2Query.toLocaleString()}
            </span>
          </div>
        ) : null}

        {/* Event distribution */}
        <div className={styles.tooltipDivider} />
        <div className={styles.tooltipSubHeader}>event</div>
        {EVENTS.map(({ key, label }) => (
          <DistributionRow
            key={key}
            label={label}
            value={eventCounts[key]}
            total={eventCounts.total}
            color={CHUNK_COLOR[key]}
          />
        ))}

        {/* Span stats */}
        <div className={styles.tooltipDivider} />
        <div className={styles.tooltipSubHeader}>gene span</div>
        <DistributionRow label="Base" value={bpGeneBase} total={baseSpan} color={OTHERS_COL} withUnit />
        <DistributionRow label="Query" value={bpGeneQuery} total={querySpan} color={OTHERS_COL} withUnit />

        {/* Event distribution */}
        {isOthers && (
          <>
            <div className={styles.tooltipDivider} />
            <div className={styles.tooltipSubHeader}>Query chromosomes</div>
            {parseChromCounts(queryChromCounts, eventCounts.total).map(([chromosome, count]) => (
              <DistributionRow
                key={chromosome}
                label={chromosome}
                value={count}
                total={eventCounts.total}
                color={OTHERS_COL}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
