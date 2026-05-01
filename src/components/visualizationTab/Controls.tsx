import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { CHUNK_COLOR, ChunkEvent } from "@/src/constants";
import { exportSvg } from "@/src/components/visualizationTab/utils";

interface ControlsProps {
  svgRef: RefObject<SVGSVGElement | null>;
}

const EVENTS: Array<{ key: ChunkEvent; short: string }> = [
  { key: "synteny", short: "synt" },
  { key: "inversion", short: "inv" },
  { key: "translocation", short: "trans" },
  { key: "translocation+inversion", short: "t+inv" },
];

export const Controls = ({ svgRef }: ControlsProps) => {
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const setGapBp = useVisualizationStore((s) => s.setGapBp);
  const setHiddenThreshold = useVisualizationStore((s) => s.setHiddenThreshold);
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
          style={{ width: 71 }}
        />
      </div>

      <div className={styles.sep} />

      {/* hidden threshold */}
      <div className={styles.controlGroup}>
        <span className={styles.controlLabel}>Hidden threshold (genes)</span>
        <input
          className={styles.controlInput}
          type="number"
          min={0}
          step={1}
          value={hiddenThreshold}
          onChange={(e) => setHiddenThreshold(parseInt(e.target.value) || 0)}
          style={{ width: 55 }}
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
      </button>

      {/* Legend */}
      <div className={styles.legend}>
        {EVENTS.map(({ key, short }) => (
          <div className={styles.legendItem} key={key}>
            <div className={styles.legendSwatch} style={{ background: CHUNK_COLOR[key] }} />
            {short}
          </div>
        ))}
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
};
