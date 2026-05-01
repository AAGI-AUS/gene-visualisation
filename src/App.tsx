import { useState } from "react";
import "./global.css";
import styles from "./App.module.css";
import { useAppStore } from "@/src/store/useAppStore";
import { DistributionTab } from "@/src/components/DistributionTab";
import { VisualizationTab } from "@/src/components/visualizationTab/VisualizationTab";
import { Sidebar } from "@/src/components/sideBar/Sidebar";

type Tab = "Visualization" | "Distribution";
const TABS: Tab[] = ["Visualization", "Distribution"];

const App = () => {
  const result = useAppStore((s) => s.result);
  const error = useAppStore((s) => s.error);
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
              (result.length ? (
                <VisualizationTab data={result} />
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>◈</span>
                  <span className={styles.emptyTitle}>Load both BED files and run analysis</span>
                  <span className={styles.emptySub}>Synteny ribbons will appear here</span>
                </div>
              ))}

            {tab === "Distribution" &&
              (result.length ? (
                <DistributionTab data={result[0].rows} />
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
