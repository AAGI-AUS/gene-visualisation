import styles from "./VisualizationTab.module.css";
import {
  useVisualizationStore,
  INTRA_RELABEL_CYCLE,
  INTRA_RELABEL_LABEL,
} from "@/src/store/useVisualizationStore";
import { NumberControl } from "@/src/components/visualizationTab/NumberControl";
import { ToggleButton } from "@/src/components/visualizationTab/ToggleButton";

export const IntraRelabelControls = () => {
  const intra = useVisualizationStore((s) => s.intra);
  const setIntra = useVisualizationStore((s) => s.setIntra);

  const cycleIntraRelabel = () =>
    setIntra((prev) => ({
      relabel:
        INTRA_RELABEL_CYCLE[(INTRA_RELABEL_CYCLE.indexOf(prev.relabel) + 1) % INTRA_RELABEL_CYCLE.length],
    }));
  const setWindowMbp = (v: number) => setIntra({ windowMbp: v });
  const setMinBackbones = (v: number) => setIntra({ minBackbones: v });
  const setGapStopMbp = (v: number) => setIntra({ gapStopMbp: v });
  const setDriftK = (v: number) => setIntra({ driftK: v });
  const setComplexMin = (v: number) => setIntra({ complexMin: v });

  return (
    <>
      <ToggleButton
        active={intra.relabel !== "off"}
        onClick={cycleIntraRelabel}
        text={INTRA_RELABEL_LABEL[intra.relabel]}
      />
      <NumberControl
        label="Window"
        unit="Mbp"
        value={intra.windowMbp}
        onChange={setWindowMbp}
        min={10}
        step={10}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Min backbones"
        unit="chunks"
        value={intra.minBackbones}
        onChange={setMinBackbones}
        min={1}
      />
      <div className={styles.sep} />
      <NumberControl label="Gap stop" unit="Mbp" value={intra.gapStopMbp} onChange={setGapStopMbp} />
      <div className={styles.sep} />
      <NumberControl label="Drift cutoff" value={intra.driftK} onChange={setDriftK} step={0.01} max={1} />
      <div className={styles.sep} />
      <NumberControl
        label="Complex min"
        unit="items"
        value={intra.complexMin}
        onChange={setComplexMin}
        min={1}
      />
    </>
  );
};
