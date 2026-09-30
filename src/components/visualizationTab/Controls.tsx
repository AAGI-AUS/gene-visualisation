import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { COMMON_CHR_THRESHOLD, HELP } from "@/src/constants";
// import { COMMON_CHR_THRESHOLD, HELP, OTHERS_CYCLE, OTHERS_LABEL } from "@/src/constants";
import { useAppStore } from "@/src/store/useAppStore";
import { NumberControl } from "@/src/components/visualizationTab/NumberControl";
import { ExportButtons } from "@/src/components/visualizationTab/ExportButtons";
import { ToggleButton } from "@/src/components/visualizationTab/ToggleButton";
import { IntraRelabelControls } from "@/src/components/visualizationTab/IntraRelabelControls";

interface ControlsProps {
  svgRef: RefObject<SVGSVGElement | null>;
}

export const Controls = ({ svgRef }: ControlsProps) => {
  const selectedChr = useAppStore((s) => s.selectedChr);
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);
  // const othersMode = useVisualizationStore((s) => s.othersMode);
  const commonOnly = useVisualizationStore((s) => s.commonOnly);
  const denoise = useVisualizationStore((s) => s.denoise);
  const sharedAxis = useVisualizationStore((s) => s.sharedAxis);
  const boundaryTicks = useVisualizationStore((s) => s.boundaryTicks);
  const showMarks = useVisualizationStore((s) => s.showMarks);
  const stripBlankMbp = useVisualizationStore((s) => s.stripBlankMbp);
  const tickIntervalMbp = useVisualizationStore((s) => s.tickIntervalMbp);
  const svgW = useVisualizationStore((s) => s.svgW);
  const fontSize = useVisualizationStore((s) => s.fontSize);
  const setGapBp = useVisualizationStore((s) => s.setGapBp);
  const setHiddenThreshold = useVisualizationStore((s) => s.setHiddenThreshold);
  // const setOthersMode = useVisualizationStore((s) => s.setOthersMode);
  const setCommonOnly = useVisualizationStore((s) => s.setCommonOnly);
  const setDenoise = useVisualizationStore((s) => s.setDenoise);
  const setSharedAxis = useVisualizationStore((s) => s.setSharedAxis);
  const setBoundaryTicks = useVisualizationStore((s) => s.setBoundaryTicks);
  const setShowMarks = useVisualizationStore((s) => s.setShowMarks);
  const setStripBlankMbp = useVisualizationStore((s) => s.setStripBlankMbp);
  const setTickIntervalMbp = useVisualizationStore((s) => s.setTickIntervalMbp);
  const setSvgW = useVisualizationStore((s) => s.setSvgW);
  const setFontSize = useVisualizationStore((s) => s.setFontSize);

  // const toggleOthersMode = () =>
  //   setOthersMode((v) => OTHERS_CYCLE[(OTHERS_CYCLE.indexOf(v) + 1) % OTHERS_CYCLE.length]);
  const commonText = `Common ≥${Math.round(COMMON_CHR_THRESHOLD * 100)}%`;

  return (
    <div className={styles.controls}>
      <NumberControl
        label="Gap"
        unit="kbp"
        value={gapBp}
        onChange={setGapBp}
        step={10}
        min={10}
        width={55}
        help={HELP.gapBp}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Hidden threshold"
        unit="genes"
        value={hiddenThreshold}
        onChange={setHiddenThreshold}
        help={HELP.hiddenThreshold}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Strip blank"
        unit="Mbp"
        value={stripBlankMbp}
        onChange={setStripBlankMbp}
        step={50}
        help={HELP.stripBlankMbp}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Ticks"
        unit="Mbp"
        value={tickIntervalMbp}
        onChange={setTickIntervalMbp}
        step={10}
        width={55}
        help={HELP.tickIntervalMbp}
      />
      <div className={styles.sep} />

      {/* toggles */}
      {/* <ToggleButton */}
      {/*   active={othersMode !== "hide"} */}
      {/*   onClick={toggleOthersMode} */}
      {/*   text={OTHERS_LABEL[othersMode]} */}
      {/*   help={HELP.othersMode} */}
      {/* /> */}
      <ToggleButton
        active={commonOnly}
        onClick={() => setCommonOnly((v) => !v)}
        text={commonText}
        help={HELP.commonOnly}
      />
      <ToggleButton active={denoise} onClick={() => setDenoise((v) => !v)} text="Denoise" help={HELP.denoise} />
      <ToggleButton
        active={sharedAxis}
        onClick={() => setSharedAxis((v) => !v)}
        text="Shared axis"
        help={HELP.sharedAxis}
      />
      <ToggleButton
        active={boundaryTicks}
        onClick={() => setBoundaryTicks((v) => !v)}
        text="Intra ticks"
        help={HELP.boundaryTicks}
      />
      <ToggleButton
        active={showMarks}
        onClick={() => setShowMarks((v) => !v)}
        text="Marks"
        help={HELP.showMarks}
      />

      {/* Render + export cluster (right-aligned) */}
      <div className={styles.rightCluster}>
        <NumberControl
          label="Font"
          value={fontSize}
          onChange={setFontSize}
          min={6}
          help={HELP.fontSize}
          helpAlign="end"
        />
        <NumberControl
          label="Width"
          value={svgW}
          onChange={setSvgW}
          min={400}
          step={50}
          width={60}
          help={HELP.svgW}
          helpAlign="end"
        />
        <ExportButtons svgRef={svgRef} filenameBase={selectedChr.toLowerCase()} />
      </div>

      <div className={styles.rowBreak} />
      <IntraRelabelControls />
    </div>
  );
};
