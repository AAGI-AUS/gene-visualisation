import styles from "./VisualizationTab.module.css";
import {
  useVisualizationStore,
  INTRA_RELABEL_CYCLE,
  INTRA_RELABEL_LABEL,
} from "@/src/store/useVisualizationStore";
import { NumberControl } from "@/src/components/visualizationTab/NumberControl";
import { ToggleButton } from "@/src/components/visualizationTab/ToggleButton";

export const IntraRelabelControls = () => {
  const intraRelabel = useVisualizationStore((s) => s.intraRelabel);
  const intraWindowMbp = useVisualizationStore((s) => s.intraWindowMbp);
  const intraMinBackbones = useVisualizationStore((s) => s.intraMinBackbones);
  const intraGapStopRatio = useVisualizationStore((s) => s.intraGapStopRatio);
  const intraDriftPctOff = useVisualizationStore((s) => s.intraDriftPctOff);
  const setIntraRelabel = useVisualizationStore((s) => s.setIntraRelabel);
  const setIntraWindowMbp = useVisualizationStore((s) => s.setIntraWindowMbp);
  const setIntraMinBackbones = useVisualizationStore((s) => s.setIntraMinBackbones);
  const setIntraGapStopRatio = useVisualizationStore((s) => s.setIntraGapStopRatio);
  const setIntraDriftPctOff = useVisualizationStore((s) => s.setIntraDriftPctOff);

  const cycleIntraRelabel = () =>
    setIntraRelabel(
      (v) => INTRA_RELABEL_CYCLE[(INTRA_RELABEL_CYCLE.indexOf(v) + 1) % INTRA_RELABEL_CYCLE.length]
    );

  return (
    <>
      <ToggleButton
        active={intraRelabel !== "off"}
        onClick={cycleIntraRelabel}
        text={INTRA_RELABEL_LABEL[intraRelabel]}
      />
      <NumberControl
        label="Window"
        unit="Mbp"
        value={intraWindowMbp}
        onChange={setIntraWindowMbp}
        min={10}
        step={10}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Min backbones"
        unit="chunks"
        value={intraMinBackbones}
        onChange={setIntraMinBackbones}
        min={1}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Win stop"
        unit="times"
        value={intraGapStopRatio}
        onChange={setIntraGapStopRatio}
        min={1}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Drift cutoff"
        unit="× bb-drift"
        value={intraDriftPctOff}
        onChange={setIntraDriftPctOff}
        min={0}
        step={0.1}
      />
    </>
  );
};
