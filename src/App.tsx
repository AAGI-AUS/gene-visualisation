import { useState } from "react";
import "./global.css";
import styles from "./App.module.css";
import { useAppStore } from "@/src/store/useAppStore";
// import { VisualizationTab } from "@/src/components/VisualizationTab";
import { Sidebar } from "@/src/components/Sidebar";
import { TableTab } from "@/src/components/TableTab";
import { DistributionTab } from "@/src/components/DistributionTab";
import { VisualizationTab } from "@/src/components/visualizationTab/VisualizationTab";

type Tab = "Visualization" | "Results" | "Distribution";
const TABS: Tab[] = ["Visualization", "Results", "Distribution"];

const App = () => {
  const result = useAppStore((s) => s.result);
  const error = useAppStore((s) => s.error);
  const baseFile = useAppStore((s) => s.baseFile);
  const queryFile = useAppStore((s) => s.queryFile);
  const [tab, setTab] = useState<Tab>("Visualization");

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <span className={styles.topbarLogo}>◈ BED SYNTENY</span>
        <span className={styles.topbarSep}>│</span>
        <span>GENOMIC COMPARISON TOOL</span>
        <span className={styles.topbarSep}>│</span>
        <span>v1.0</span>
      </header>

      <div className={styles.main}>
        <Sidebar />

        <div className={styles.content}>
          <div className={styles.tabBar}>
            {TABS.map((t) => (
              <div
                key={t}
                className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
                onClick={() => setTab(t)}
              >
                {t}
              </div>
            ))}
          </div>

          <div className={styles.contentBody}>
            {error && <div className={styles.errorBox}>⚠ {error}</div>}

            {tab === "Visualization" &&
              (result ? (
                <VisualizationTab
                  data={result}
                  baseLabel={baseFile?.name ?? "Baseline"}
                  queryLabel={queryFile?.name ?? "Query"}
                />
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>◈</span>
                  <span className={styles.emptyTitle}>Load both BED files and run analysis</span>
                  <span className={styles.emptySub}>Synteny ribbons will appear here</span>
                </div>
              ))}

            {tab === "Results" &&
              (result ? (
                <TableTab data={result} />
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>⬡</span>
                  <span className={styles.emptyTitle}>No results yet</span>
                  <span className={styles.emptySub}>Load both BED files and click RUN ANALYSIS</span>
                </div>
              ))}

            {tab === "Distribution" &&
              (result ? (
                <DistributionTab data={result} />
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>▦</span>
                  <span className={styles.emptyTitle}>Run an analysis first</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
