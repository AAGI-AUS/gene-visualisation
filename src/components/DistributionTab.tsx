import { useMemo } from "react";
import type { ResultRow } from "@/types";
import styles from "./DistributionTab.module.css";

const BARCOLORS = ["#4ea8ff", "#39ff87", "#ffb340", "#ff4e6a", "#c084fc", "#34d399", "#f97316", "#60a5fa"];

interface DistributionTabProps {
  data: ResultRow[];
}

export const DistributionTab = ({ data }: DistributionTabProps) => {
  const total = data.length || 1;

  const eventCounts = useMemo(
    () => ({
      synteny: data.filter((r) => r.mainEvent === "synteny").length,
      inversion: data.filter((r) => r.mainEvent === "inversion").length,
      translocation: data.filter((r) => r.mainEvent === "translocation").length,
    }),
    [data]
  );

  const groupedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((r) => {
      const g = r.groupedQuery || "others";
      counts[g] = (counts[g] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20);
  }, [data]);

  const maxGroupCount = groupedCounts[0]?.[1] ?? 1;

  const eventBars: Array<{
    label: string;
    count: number;
    color: string;
  }> = [
    { label: "Synteny", count: eventCounts.synteny, color: "var(--blue)" },
    { label: "Inversion", count: eventCounts.inversion, color: "var(--amber)" },
    {
      label: "Transloc.",
      count: eventCounts.translocation,
      color: "var(--red)",
    },
  ];

  return (
    <div>
      {/* Event distribution */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Event Distribution</div>
        <div className={styles.eventBars}>
          {eventBars.map(({ label, count, color }) => (
            <div className={styles.eventCol} key={label}>
              <div className={styles.eventCount} style={{ color }}>
                {count.toLocaleString()}
              </div>
              <div className={styles.eventBarWrap}>
                <div
                  className={styles.eventBar}
                  style={{
                    height: `${Math.max(2, (count / total) * 60)}px`,
                    background: color,
                    opacity: 0.8,
                  }}
                />
              </div>
              <div className={styles.eventLabel}>{label}</div>
              <div className={styles.eventPct}>{((count / total) * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* groupedQuery chromosome distribution */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Query Chromosome Groups (groupedQuery)</div>
        <div className={styles.chrChart}>
          {groupedCounts.map(([name, count], i) => (
            <div className={styles.chrRow} key={name}>
              <div className={styles.chrName} title={name}>
                {name}
              </div>
              <div className={styles.chrBarBg}>
                <div
                  className={styles.chrBarFill}
                  style={{
                    width: `${(count / maxGroupCount) * 100}%`,
                    background: BARCOLORS[i % BARCOLORS.length],
                  }}
                />
              </div>
              <div className={styles.chrPct}>{((count / total) * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
