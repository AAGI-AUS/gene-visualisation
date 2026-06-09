import { useAppStore } from "@/src/store/useAppStore";
import styles from "./Sidebar.module.css";
import { abortBatchExport, batchExportAll } from "@/src/components/visualizationTab/batchExport";
import { MAX_WORKERS } from "@/src/store/workerPool";
import { clamp } from "@/src/utils";

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

const RunActions = () => {
  const base = useAppStore((s) => s.base);
  const queryFiles = useAppStore((s) => s.queryFiles);
  const chromosomes = useAppStore((s) => s.chromosomes);
  const running = useAppStore((s) => s.running);
  const batching = useAppStore((s) => s.batching);
  const runAnalysis = useAppStore((s) => s.runAnalysis);
  const autoSort = useAppStore((s) => s.autoSort);

  const canRun = Boolean(base && queryFiles?.[0]) && !running;
  const canBatch = canRun && chromosomes.length > 0;

  const batchClass = `${styles.runBtn} ${batching ? styles.abortBtn : ""}`;

  const handleBatch = () => {
    if (batching) abortBatchExport();
    else void batchExportAll();
  };

  return (
    <>
      <button className={styles.runBtn} disabled={!canRun || batching} onClick={runAnalysis} type="button">
        {running ? "RUNNING..." : "▶ RUN"}
      </button>
      <button className={styles.runBtn} disabled={!canRun || batching} onClick={autoSort} type="button">
        {running ? "RUNNING..." : "▶ AUTOSORT"}
      </button>
      <button className={batchClass} disabled={!batching && !canBatch} onClick={handleBatch} type="button">
        {batching ? "✕ ABORT" : "↓ ALL CHR (ZIP)"}
      </button>
    </>
  );
};

export const Parameters = () => {
  const groupThreshold = useAppStore((s) => s.groupThreshold);
  const workerCount = useAppStore((s) => s.workerCount);
  const setAppState = useAppStore((s) => s.setAppState);

  const handleWorkers = (n: string) =>
    setAppState({ workerCount: clamp(Math.floor(Number(n) || 1), 1, MAX_WORKERS) });

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

        <div className={styles.thresholdRow}>
          <label className={styles.thresholdLabel}>Workers</label>
          <input
            className={styles.thresholdInput}
            type="number"
            step="1"
            min="1"
            max={MAX_WORKERS}
            value={workerCount}
            onChange={(e) => handleWorkers(e.target.value)}
          />
        </div>

        <RunActions />
      </div>
    </div>
  );
};
