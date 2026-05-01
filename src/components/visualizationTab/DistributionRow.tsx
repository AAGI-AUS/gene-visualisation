import { pct } from "@/src/components/visualizationTab/utils";
import styles from "./VisualizationTab.module.css";

const bpLabel = (bp: number): { value: string; unit: string } => {
  if (bp >= 1e6) {
    return { value: (bp / 1e6).toFixed(2), unit: "Mbp" };
  }
  if (bp >= 1e3) {
    return { value: (bp / 1e3).toFixed(1), unit: "kbp" };
  }
  return { value: `${bp}`, unit: "bp" };
};

type DistributionRowProps = {
  label: string;
  value: number;
  total: number | null;
  color: string;
  withUnit?: boolean;
};

export const DistributionRow = ({ label, value, total, color, withUnit }: DistributionRowProps) => {
  if (!total || !value) return null;

  const unitValue = withUnit ? bpLabel(value) : { value: value, unit: "" };
  const unitLabel = withUnit ? `${label} (${unitValue.unit})` : label;

  return (
    <div className={styles.distRow}>
      <span className={styles.distLabel}>{unitLabel}</span>
      <div className={styles.distBarWrap}>
        <div className={styles.distBar} style={{ width: `${(value / total) * 100}%`, background: color }} />
      </div>
      <span className={styles.distN}>{unitValue.value}</span>
      <span className={styles.distPct}>{pct(value, total)}</span>
    </div>
  );
};
