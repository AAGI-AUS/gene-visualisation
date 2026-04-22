import type { ResultRow } from "@/types";
import styles from "./Sidebar.module.css";
import { useAppStore } from "@/src/store/useAppStore";
import { FileSlot } from "@/src/components/FileSlot";

function StatGrid({ result }: { result: ResultRow[] }) {
  const total = result.length;
  const synteny = result.filter((r) => r.mainEvent === "synteny").length;
  const inversion = result.filter((r) => r.mainEvent === "inversion").length;
  const translocation = result.filter((r) => r.mainEvent === "translocation").length;

  const stats: Array<{ label: string; value: number; cls: string }> = [
    { label: "Total", value: total, cls: "" },
    { label: "Synteny", value: synteny, cls: "blue" },
    { label: "Inversion", value: inversion, cls: "amber" },
    { label: "Translocate", value: translocation, cls: "red" },
  ];

  return (
    <div className={styles.statGrid}>
      {stats.map(({ label, value, cls }) => (
        <div className={styles.statCard} key={label}>
          <div className={`${styles.statVal} ${cls ? styles[cls as keyof typeof styles] : ""}`}>
            {value.toLocaleString()}
          </div>
          <div className={styles.statLabel}>{label}</div>
        </div>
      ))}
    </div>
  );
}

export function Sidebar() {
  const baseFile = useAppStore((s) => s.baseFile);
  const queryFile = useAppStore((s) => s.queryFile);
  const offLocThreshold = useAppStore((s) => s.offLocThreshold);
  const groupThreshold = useAppStore((s) => s.groupThreshold);
  const result = useAppStore((s) => s.result);
  const setBaseFile = useAppStore((s) => s.setBaseFile);
  const setQueryFile = useAppStore((s) => s.setQueryFile);
  const setAppState = useAppStore((s) => s.setAppState);
  const clearBase = useAppStore((s) => s.clearBase);
  const clearQuery = useAppStore((s) => s.clearQuery);
  const runAnalysis = useAppStore((s) => s.runAnalysis);

  const canRun = Boolean(baseFile && queryFile);
  const setGroupThreshold = (value = 0.01) => setAppState({ groupThreshold: value });
  const setOffLocThreshold = (value = 0.05) => setAppState({ offLocThreshold: value });

  return (
    <aside className={styles.sidebar}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>Input Files</div>
        <div className={styles.panelBody}>
          <FileSlot label="Baseline" file={baseFile} onLoad={setBaseFile} onClear={clearBase} />
          <FileSlot label="Query" file={queryFile} onLoad={setQueryFile} onClear={clearQuery} />
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>Parameters</div>
        <div className={styles.panelBody}>
          <div className={styles.thresholdRow}>
            <label className={styles.thresholdLabel}>Off location threshold</label>
            <input
              className={styles.thresholdInput}
              type="number"
              step="0.001"
              min="0"
              max="1"
              value={offLocThreshold}
              onChange={(e) => setOffLocThreshold(parseFloat(e.target.value))}
            />
          </div>
          <div className={styles.thresholdRow}>
            <label className={styles.thresholdLabel}>Group threshold</label>
            <input
              className={styles.thresholdInput}
              type="number"
              step="0.001"
              min="0"
              max="1"
              value={groupThreshold}
              onChange={(e) => setGroupThreshold(parseFloat(e.target.value))}
            />
          </div>
          <button className={styles.runBtn} disabled={!canRun} onClick={runAnalysis} type="button">
            ▶ RUN ANALYSIS
          </button>
        </div>
      </div>

      {result && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>Summary</div>
          <div className={styles.panelBody}>
            <StatGrid result={result} />
          </div>
        </div>
      )}
    </aside>
  );
}
