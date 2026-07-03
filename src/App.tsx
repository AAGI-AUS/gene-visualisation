import { useRef, useState } from "react";
import "./global.css";
import styles from "./App.module.css";
import { useAppStore } from "@/src/store/useAppStore";
import { VisualizationTab } from "@/src/components/visualizationTab/VisualizationTab";
import { SummaryTab } from "@/src/components/summaryTab/SummaryTab";
import { Sidebar } from "@/src/components/sideBar/Sidebar";
import { RunButton } from "@/src/components/sideBar/RunButton";

const App = () => {
  const result = useAppStore((s) => s.result);
  const error = useAppStore((s) => s.error);
  const [tab, setTab] = useState<Tab>("Visualization");
  const svgRef = useRef<SVGSVGElement>(null);

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
            {result.length === 0 ? (
              <EmptyState />
            ) : tab === "Visualization" ? (
              <VisualizationTab data={result} svgRef={svgRef} />
            ) : (
              <SummaryTab />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;

const TABS = ["Visualization", "Summary"] as const;
type Tab = (typeof TABS)[number];

const EmptyState = () => (
  <div className={styles.emptyState}>
    <span className={styles.emptyTitle}>Load BED files and run analysis</span>
    <div className={styles.emptyAction}>
      <RunButton />
    </div>
  </div>
);
