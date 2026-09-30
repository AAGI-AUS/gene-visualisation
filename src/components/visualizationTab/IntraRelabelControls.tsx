import styles from "./VisualizationTab.module.css";
import { HELP } from "@/src/constants";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { NumberControl } from "@/src/components/visualizationTab/NumberControl";
import { ToggleButton } from "@/src/components/visualizationTab/ToggleButton";

export const IntraRelabelControls = () => {
  const intra = useVisualizationStore((s) => s.intra);
  const setIntra = useVisualizationStore((s) => s.setIntra);

  const toggleIntraRelabel = () => setIntra((prev) => ({ relabel: !prev.relabel }));
  const setMinLocalEvents = (v: number) => setIntra({ minLocalEvents: v });
  const setGapStopMbp = (v: number) => setIntra({ gapStopMbp: v });
  const setDriftK = (v: number) => setIntra({ driftK: v });
  const setComplexMin = (v: number) => setIntra({ complexMin: v });

  return (
    <>
      <ToggleButton
        active={intra.relabel}
        onClick={toggleIntraRelabel}
        text="Intra relabel"
        help={HELP.intraRelabel}
      />
      <NumberControl
        label="Min local events"
        unit="events"
        value={intra.minLocalEvents}
        onChange={setMinLocalEvents}
        min={100}
        step={100}
        help={HELP.minLocalEvents}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Gap stop"
        unit="Mbp"
        value={intra.gapStopMbp}
        onChange={setGapStopMbp}
        help={HELP.gapStopMbp}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Drift cutoff"
        value={intra.driftK}
        onChange={setDriftK}
        step={0.05}
        max={1}
        help={HELP.driftK}
      />
      <div className={styles.sep} />
      <NumberControl
        label="Complex min"
        unit="items"
        value={intra.complexMin}
        onChange={setComplexMin}
        min={1}
        help={HELP.complexMin}
      />
    </>
  );
};
