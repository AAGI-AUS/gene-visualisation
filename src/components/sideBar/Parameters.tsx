import { useAppStore } from "@/src/store/useAppStore";
import styles from "./Sidebar.module.css";

function ChrSelect() {
  // Unique chromosomes in order of first appearance
  const selectedChr = useAppStore((s) => s.selectedChr);
  const chromosomes = useAppStore((s) => s.chromosomes);
  const setAppState = useAppStore((s) => s.setAppState);

  const disabled = chromosomes.length === 0;
  return (
    <div className={styles.thresholdRow}>
      <label className={styles.thresholdLabel}>Base chromosome</label>
      <select
        className={styles.chrSelect}
        value={selectedChr}
        disabled={disabled}
        onChange={(e) => setAppState({ selectedChr: e.target.value })}
      >
        {chromosomes.map((chr) => (
          <option key={chr} value={chr}>
            {chr}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Parameters() {
  const base = useAppStore((s) => s.base);
  const queryFiles = useAppStore((s) => s.queryFiles);
  const groupThreshold = useAppStore((s) => s.groupThreshold);
  const setAppState = useAppStore((s) => s.setAppState);
  const runAnalysis = useAppStore((s) => s.runAnalysis);

  const canRun = Boolean(base && queryFiles?.[0]);
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>Parameters</div>
      <div className={styles.panelBody}>
        <ChrSelect />

        <div className={styles.thresholdRow}>
          <label className={styles.thresholdLabel}>Group threshold</label>
          <input
            className={styles.thresholdInput}
            type="number"
            step="0.001"
            min="0"
            max="1"
            value={groupThreshold}
            onChange={(e) => setAppState({ groupThreshold: parseFloat(e.target.value) })}
          />
        </div>

        <button className={styles.runBtn} disabled={!canRun} onClick={runAnalysis} type="button">
          ▶ RUN
        </button>
      </div>
    </div>
  );
}
