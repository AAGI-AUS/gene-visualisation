import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { CHUNK_COLOR, ChunkEvent, COMMON_CHR_THRESHOLD, OTHERS_CYCLE, OTHERS_LABEL } from "@/src/constants";
import { useAppStore } from "@/src/store/useAppStore";
import { NumberControl } from "@/src/components/visualizationTab/NumberControl";
import { ExportButtons } from "@/src/components/visualizationTab/ExportButtons";

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
  const stripBlankMbp = useVisualizationStore((s) => s.stripBlankMbp);
  const svgW = useVisualizationStore((s) => s.svgW);
  const fontSize = useVisualizationStore((s) => s.fontSize);
  const setGapBp = useVisualizationStore((s) => s.setGapBp);
  const setHiddenThreshold = useVisualizationStore((s) => s.setHiddenThreshold);
  const setOthersMode = useVisualizationStore((s) => s.setOthersMode);
  const setCommonOnly = useVisualizationStore((s) => s.setCommonOnly);
  const setDenoise = useVisualizationStore((s) => s.setDenoise);
  const setSharedAxis = useVisualizationStore((s) => s.setSharedAxis);
  const setStripBlankMbp = useVisualizationStore((s) => s.setStripBlankMbp);
  const setSvgW = useVisualizationStore((s) => s.setSvgW);
  const setFontSize = useVisualizationStore((s) => s.setFontSize);

  const toggleOthersMode = () =>
    setOthersMode((v) => OTHERS_CYCLE[(OTHERS_CYCLE.indexOf(v) + 1) % OTHERS_CYCLE.length]);

  return (
    <div className={styles.controls}>
      <NumberControl
        label="Gap (bp)"
        value={gapBp}
        onChange={setGapBp}
        min={0}
        step={10000}
        fallback={10000}
        width={71}
      />

      <div className={styles.sep} />

      <NumberControl
        label="Hidden threshold (genes)"
        value={hiddenThreshold}
        onChange={setHiddenThreshold}
        min={0}
        step={1}
        fallback={0}
        width={55}
      />

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

      <NumberControl
        label="Strip blank (Mbp)"
        value={stripBlankMbp}
        onChange={setStripBlankMbp}
        min={0}
        step={10}
        fallback={0}
        width={55}
      />

      {/* Legend */}
      <div className={styles.legend}>
        {EVENTS.map(({ key, short }) => (
          <div className={styles.legendItem} key={key}>
            <div className={styles.legendSwatch} style={{ background: CHUNK_COLOR[key] }} />
            {short}
          </div>
        ))}
      </div>

      {/* Render + export cluster (right-aligned) */}
      <div className={styles.rightCluster}>
        <NumberControl
          label="Font"
          value={fontSize}
          onChange={setFontSize}
          min={6}
          step={1}
          fallback={11}
          width={45}
        />
        <NumberControl
          label="Width"
          value={svgW}
          onChange={setSvgW}
          min={400}
          step={50}
          fallback={900}
          width={60}
        />
        <ExportButtons svgRef={svgRef} filenameBase={selectedChr.toLowerCase()} />
      </div>
    </div>
  );
};
