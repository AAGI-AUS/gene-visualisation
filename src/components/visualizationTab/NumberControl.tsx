import type { InputHTMLAttributes } from "react";
import styles from "./VisualizationTab.module.css";

interface NumberControlProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "className" | "style"> {
  label: string;
  onChange: (n: number) => void;
  fallback?: number;
  width?: number;
  min?: number;
  unit?: string;
}

export const NumberControl = ({
  label,
  onChange,
  width = 45,
  min = 0,
  fallback = min,
  unit,
  ...rest
}: NumberControlProps) => (
  <div className={styles.controlGroup}>
    <span className={styles.controlLabel}>{label}</span>
    <input
      {...rest}
      min={min}
      className={styles.controlInput}
      type="number"
      onChange={(e) => onChange(parseFloat(e.target.value) || fallback)}
      style={{ width }}
    />
    {unit && <span className={styles.controlUnit}>{unit}</span>}
  </div>
);
