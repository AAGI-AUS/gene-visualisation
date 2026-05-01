import type { ResultRow } from "@/types";
import { useAppStore } from "@/src/store/useAppStore";
import styles from "./Sidebar.module.css";
import { InputFiles } from "@/src/components/sideBar/InputFiles";
import { Parameters } from "@/src/components/sideBar/Parameters";

// ─────────────────────────────────────────────────────────────────────────────
// StatGrid
// ─────────────────────────────────────────────────────────────────────────────

interface StatGridProps {
  result: ResultRow[];
}

function StatGrid({ result }: StatGridProps) {
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

// ─────────────────────────────────────────────────────────────────────────────
// SummaryPanel
// ─────────────────────────────────────────────────────────────────────────────

interface SummaryPanelProps {
  result: ResultRow[];
}

function SummaryPanel({ result }: SummaryPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>Summary</div>
      <div className={styles.panelBody}>
        <StatGrid result={result} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar (root)
// ─────────────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const result = useAppStore((s) => s.result);

  return (
    <aside className={styles.sidebar}>
      <InputFiles />
      <Parameters />
      {result.length > 0 && <SummaryPanel result={result[0].rows} />}
    </aside>
  );
}
