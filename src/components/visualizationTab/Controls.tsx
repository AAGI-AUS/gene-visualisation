import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { CHUNK_COLOR, ChunkEvent, COMMON_CHR_THRESHOLD, OTHERS_CYCLE, OTHERS_LABEL } from "@/src/constants";
import { exportSvg } from "@/src/components/visualizationTab/utils";
import { useAppStore } from "@/src/store/useAppStore";

interface ControlsProps {
  svgRef: RefObject<SVGSVGElement | null>;
}

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  text: string;
}

const ToggleButton = ({ active, onClick, text }: ToggleButtonProps) => (
  <button className={`${styles.toggleBtn} ${active ? styles.toggleBtnOn : ""}`} onClick={onClick} type="button">
    <span className={styles.toggleDot} />
    {text}
  </button>
);

const EVENTS: Array<{ key: ChunkEvent; short: string }> = [
  { key: "synteny", short: "synt" },
  { key: "inversion", short: "inv" },
  { key: "translocation", short: "trans" },
  { key: "translocation+inversion", short: "t+inv" },
];

export const Controls = ({ svgRef }: ControlsProps) => {
  const selectedChr = useAppStore((s) => s.selectedChr);
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const commonOnly = useVisualizationStore((s) => s.commonOnly);
  const denoise = useVisualizationStore((s) => s.denoise);
  const sharedAxis = useVisualizationStore((s) => s.sharedAxis);
  const setGapBp = useVisualizationStore((s) => s.setGapBp);
  const setHiddenThreshold = useVisualizationStore((s) => s.setHiddenThreshold);
  const setOthersMode = useVisualizationStore((s) => s.setOthersMode);
  const setCommonOnly = useVisualizationStore((s) => s.setCommonOnly);
  const setDenoise = useVisualizationStore((s) => s.setDenoise);
  const setSharedAxis = useVisualizationStore((s) => s.setSharedAxis);

  const toggleOthersMode = () =>
    setOthersMode((v) => OTHERS_CYCLE[(OTHERS_CYCLE.indexOf(v) + 1) % OTHERS_CYCLE.length]);

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
      <ToggleButton active={othersMode !== "hide"} onClick={toggleOthersMode} text={OTHERS_LABEL[othersMode]} />

      {/* Common-only toggle */}
      <ToggleButton
        active={commonOnly}
        onClick={() => setCommonOnly((v) => !v)}
        text={`Common ≥${Math.round(COMMON_CHR_THRESHOLD * 100)}%`}
      />

      {/* Denoise toggle */}
      <ToggleButton active={denoise} onClick={() => setDenoise((v) => !v)} text="Denoise" />

      {/* Shared axis toggle */}
      <ToggleButton active={sharedAxis} onClick={() => setSharedAxis((v) => !v)} text="Shared axis" />

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
        onClick={() => svgRef.current && exportSvg(svgRef.current, `${selectedChr.toLowerCase()}.svg`)}
        type="button"
      >
        ↓ SVG
      </button>
    </div>
  );
};
