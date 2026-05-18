import { useState } from "react";
import { useAppStore } from "@/src/store/useAppStore";
import styles from "./Sidebar.module.css";
import { batchExportAll } from "@/src/components/visualizationTab/batchExport";

const ChrSelect = () => {
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
};

export const Parameters = () => {
  const base = useAppStore((s) => s.base);
  const queryFiles = useAppStore((s) => s.queryFiles);
  const chromosomes = useAppStore((s) => s.chromosomes);
  const groupThreshold = useAppStore((s) => s.groupThreshold);
  const setAppState = useAppStore((s) => s.setAppState);
  const runAnalysis = useAppStore((s) => s.runAnalysis);
  const running = useAppStore((s) => s.running);
  const autoSort = useAppStore((s) => s.autoSort);
  const [batching, setBatching] = useState(false);

  const canRun = Boolean(base && queryFiles?.[0]);
  const canBatch = canRun && chromosomes.length > 0;

  const handleBatch = async () => {
    setBatching(true);
    try {
      await batchExportAll();
    } finally {
      setBatching(false);
    }
  };

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

        <button className={styles.runBtn} disabled={!canRun || running} onClick={runAnalysis} type="button">
          {running ? "RUNNING..." : "▶ RUN"}
        </button>
        <button className={styles.runBtn} disabled={!canRun || running || batching} onClick={autoSort} type="button">
          {running ? "RUNNING..." : "▶ AUTOSORT"}
        </button>
        <button
          className={styles.runBtn}
          disabled={!canBatch || running || batching}
          onClick={handleBatch}
          type="button"
        >
          {batching ? "EXPORTING..." : "↓ ALL CHR (ZIP)"}
        </button>
      </div>
    </div>
  );
};
