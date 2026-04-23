import { CHUNK_COLOR, OTHERS_COL } from "@/src/constants";
import type { Chunk, ChunkEvent } from "@/types";
import { pct } from "@/src/components/visualizationTab/utils";
import styles from "./VisualizationTab.module.css";

interface ChunkTooltipProps {
  chunk: Chunk;
  cx: number;
  cy: number;
}

const EVENT_ROWS: Array<{ key: ChunkEvent; label: string }> = [
  { key: "synteny", label: "Synteny" },
  { key: "inversion", label: "Inversion" },
  { key: "translocation", label: "Translocation" },
  { key: "translocation+inversion", label: "Trans+Inv" },
];

export function ChunkTooltip({ chunk, cx, cy }: ChunkTooltipProps) {
  const { counts, dominant } = chunk;

  return (
    <div
      className={styles.tooltip}
      style={{
        left: Math.min(cx + 16, window.innerWidth - 290),
        top: cy - 10,
      }}
    >
      <div className={styles.tooltipInner}>
        <div className={styles.tooltipHeader}>
          <span className={styles.tooltipDominant} style={{ color: CHUNK_COLOR[dominant] }}>
            {dominant}
            {chunk.isOthers ? " · others" : ""}
          </span>
          <span className={styles.tooltipCount}>{counts.total} genes</span>
        </div>

        <div className={styles.tooltipCoord}>
          <span className={styles.tooltipGenome}>base</span>
          <span>
            {chunk.chrBase}:{chunk.bp1Base.toLocaleString()}–{chunk.bp2Base.toLocaleString()}
          </span>
        </div>

        {chunk.isOthers ? (
          <div className={styles.tooltipCoord}>
            <span className={styles.tooltipGenome}>query</span>
            <span style={{ color: OTHERS_COL }}>grouped → others</span>
          </div>
        ) : chunk.chrQuery ? (
          <div className={styles.tooltipCoord}>
            <span className={styles.tooltipGenome}>query</span>
            <span>
              {chunk.chrQuery}:{chunk.bp1Query.toLocaleString()}–{chunk.bp2Query.toLocaleString()}
            </span>
          </div>
        ) : null}

        <div className={styles.tooltipDivider} />

        {EVENT_ROWS.map(({ key, label }) => {
          const n = counts[key];
          if (!n) return null;
          return (
            <div className={styles.distRow} key={key}>
              <span className={styles.distLabel}>{label}</span>
              <div className={styles.distBarWrap}>
                <div
                  className={styles.distBar}
                  style={{ width: `${(n / counts.total) * 100}%`, background: CHUNK_COLOR[key] }}
                />
              </div>
              <span className={styles.distN}>{n}</span>
              <span className={styles.distPct}>{pct(n, counts.total)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
