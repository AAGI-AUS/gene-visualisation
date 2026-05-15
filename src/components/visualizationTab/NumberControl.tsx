import type { InputHTMLAttributes } from "react";
import styles from "./VisualizationTab.module.css";

interface NumberControlProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "className" | "style"> {
  label: string;
  onChange: (n: number) => void;
  fallback: number;
  width: number;
}

export const NumberControl = ({ label, onChange, fallback, width, min = 0, ...rest }: NumberControlProps) => (
  <div className={styles.controlGroup}>
    <span className={styles.controlLabel}>{label}</span>
    <input
      {...rest}
      min={min}
      className={styles.controlInput}
      type="number"
      onChange={(e) => onChange(parseInt(e.target.value) || fallback)}
      style={{ width }}
    />
  </div>
);
