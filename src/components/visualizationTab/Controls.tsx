import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import type { ChunkEvent } from "@/src/constants";
import { CHUNK_COLOR, COMMON_CHR_THRESHOLD, OTHERS_CYCLE, OTHERS_LABEL } from "@/src/constants";
import { useAppStore } from "@/src/store/useAppStore";
import { NumberControl } from "@/src/components/visualizationTab/NumberControl";
import { ExportButtons } from "@/src/components/visualizationTab/ExportButtons";
import { ToggleButton } from "@/src/components/visualizationTab/ToggleButton";
import { IntraRelabelControls } from "@/src/components/visualizationTab/IntraRelabelControls";

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
  const selectedChr = useAppStore((s) => s.selectedChr);
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);
  const othersMode = useVisualizationStore((s) => s.othersMode);
  const commonOnly = useVisualizationStore((s) => s.commonOnly);
  const denoise = useVisualizationStore((s) => s.denoise);
  const sharedAxis = useVisualizationStore((s) => s.sharedAxis);
  const boundaryTicks = useVisualizationStore((s) => s.boundaryTicks);
  const showMarks = useVisualizationStore((s) => s.showMarks);
  const stripBlankMbp = useVisualizationStore((s) => s.stripBlankMbp);
  const svgW = useVisualizationStore((s) => s.svgW);
  const fontSize = useVisualizationStore((s) => s.fontSize);
  const setGapBp = useVisualizationStore((s) => s.setGapBp);
  const setHiddenThreshold = useVisualizationStore((s) => s.setHiddenThreshold);
  const setOthersMode = useVisualizationStore((s) => s.setOthersMode);
  const setCommonOnly = useVisualizationStore((s) => s.setCommonOnly);
  const setDenoise = useVisualizationStore((s) => s.setDenoise);
  const setSharedAxis = useVisualizationStore((s) => s.setSharedAxis);
  const setBoundaryTicks = useVisualizationStore((s) => s.setBoundaryTicks);
  const setShowMarks = useVisualizationStore((s) => s.setShowMarks);
  const setStripBlankMbp = useVisualizationStore((s) => s.setStripBlankMbp);
  const setSvgW = useVisualizationStore((s) => s.setSvgW);
  const setFontSize = useVisualizationStore((s) => s.setFontSize);

  const toggleOthersMode = () =>
    setOthersMode((v) => OTHERS_CYCLE[(OTHERS_CYCLE.indexOf(v) + 1) % OTHERS_CYCLE.length]);
  const commonText = `Common ≥${Math.round(COMMON_CHR_THRESHOLD * 100)}%`;

  return (
    <div className={styles.controls}>
      <NumberControl label="Gap" unit="kbp" value={gapBp} onChange={setGapBp} step={10} min={10} width={55} />
      <div className={styles.sep} />
      <NumberControl
        label="Hidden threshold"
        unit="genes"
        value={hiddenThreshold}
        onChange={setHiddenThreshold}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Strip blank"
        unit="Mbp"
        value={stripBlankMbp}
        onChange={setStripBlankMbp}
        step={50}
      />
      <div className={styles.sep} />

      {/* toggles */}
      <ToggleButton active={othersMode !== "hide"} onClick={toggleOthersMode} text={OTHERS_LABEL[othersMode]} />
      <ToggleButton active={commonOnly} onClick={() => setCommonOnly((v) => !v)} text={commonText} />
      <ToggleButton active={denoise} onClick={() => setDenoise((v) => !v)} text="Denoise" />
      <ToggleButton active={sharedAxis} onClick={() => setSharedAxis((v) => !v)} text="Shared axis" />
      <ToggleButton active={boundaryTicks} onClick={() => setBoundaryTicks((v) => !v)} text="Intra ticks" />
      <ToggleButton active={showMarks} onClick={() => setShowMarks((v) => !v)} text="Marks" />

      {/* Render + export cluster (right-aligned) */}
      <div className={styles.rightCluster}>
        <NumberControl label="Font" value={fontSize} onChange={setFontSize} min={6} />
        <NumberControl label="Width" value={svgW} onChange={setSvgW} min={400} step={50} width={60} />
        <ExportButtons svgRef={svgRef} filenameBase={selectedChr.toLowerCase()} />
      </div>

      <div className={styles.rowBreak} />
      <IntraRelabelControls />

      {/* legend */}
      <div className={styles.legend}>
        {EVENTS.map(({ key, short }) => (
          <div className={styles.legendItem} key={key}>
            <div className={styles.legendSwatch} style={{ background: CHUNK_COLOR[key] }} />
            {short}
          </div>
        ))}
      </div>
    </div>
  );
};
