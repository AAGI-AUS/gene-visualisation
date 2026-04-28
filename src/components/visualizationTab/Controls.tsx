import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { ChunkEvent, EventCounts } from "@/types";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { CHUNK_COLOR, OTHERS_COL } from "@/src/constants";
import { exportSvg } from "@/src/components/visualizationTab/utils";

interface ControlsProps {
  chunkCount: number;
  globalCounts: EventCounts;
  othersCount: number;
  svgRef: RefObject<SVGSVGElement | null>;
}

const EVENTS: Array<{ key: ChunkEvent; short: string }> = [
  { key: "synteny", short: "synt" },
  { key: "inversion", short: "inv" },
  { key: "translocation", short: "trans" },
  { key: "translocation+inversion", short: "t+inv" },
];

export function Controls({ chunkCount, globalCounts, othersCount, svgRef }: ControlsProps) {
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const setGapBp = useVisualizationStore((s) => s.setGapBp);
  const setOthers = useVisualizationStore((s) => s.setOthersMode);

  return (
    <div className={styles.controls}>
      {/* Gap threshold */}
      <div className={styles.controlGroup}>
        <span className={styles.controlLabel}>Gap (bp)</span>
        <input
          className={styles.controlInput}
          type="number"
          min={0}
          step={10000}
          value={gapBp}
          onChange={(e) => setGapBp(parseInt(e.target.value) || 10000)}
          style={{ width: 90 }}
        />
      </div>

      <div className={styles.sep} />

      {/* Others mode toggle */}
      <button
        className={`${styles.toggleBtn} ${othersMode ? styles.toggleBtnOn : ""}`}
        onClick={() => setOthers((v) => !v)}
        type="button"
      >
        <span className={styles.toggleDot} />
        Group others
        {othersCount > 0 && <span className={styles.toggleBadge}>{othersCount}</span>}
      </button>

      <div className={styles.sep} />

      {/* Stats */}
      <div className={styles.statsStrip}>
        <div className={styles.statItem}>
          <span className={styles.statNum}>{chunkCount}</span>
          <span>chunks</span>
        </div>
        {EVENTS.map(({ key, short }) => (
          <div className={styles.statItem} key={key}>
            <span className={styles.statNum} style={{ color: CHUNK_COLOR[key] }}>
              {globalCounts[key]}
            </span>
            <span>{short}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        {EVENTS.map(({ key, short }) => (
          <div className={styles.legendItem} key={key}>
            <div className={styles.legendSwatch} style={{ background: CHUNK_COLOR[key] }} />
            {short}
          </div>
        ))}
        {othersMode && (
          <div className={styles.legendItem}>
            <div className={styles.legendSwatch} style={{ background: OTHERS_COL }} />
            others
          </div>
        )}
      </div>

      {/* Export */}
      <button
        className={styles.exportBtn}
        onClick={() => svgRef.current && exportSvg(svgRef.current)}
        type="button"
      >
        ↓ SVG
      </button>
    </div>
  );
}
