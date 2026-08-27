import type { InputHTMLAttributes } from "react";
import styles from "./VisualizationTab.module.css";
import type { HelpAlign } from "@/src/help";
import { helpProps } from "@/src/help";

interface NumberControlProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "className" | "style"> {
  label: string;
  onChange: (n: number) => void;
  fallback?: number;
  onEmpty?: () => void;
  width?: number;
  min?: number;
  unit?: string;
  help?: string;
  helpAlign?: HelpAlign;
}

export const NumberControl = ({
  label,
  onChange,
  width = 45,
  min = 0,
  fallback = min,
  onEmpty,
  unit,
  help,
  helpAlign,
  ...rest
}: NumberControlProps) => (
  <div className={styles.controlGroup}>
    <span className={styles.controlLabel} {...helpProps(help, helpAlign)}>
      {label}
    </span>
    <input
      {...rest}
      min={min}
      className={styles.controlInput}
      type="number"
      onChange={(e) => {
        if (e.target.value === "" && onEmpty) return onEmpty();
        const parsed = parseFloat(e.target.value);
        onChange(Number.isNaN(parsed) ? fallback : parsed);
      }}
      style={{ width }}
    />
    {unit && <span className={styles.controlUnit}>{unit}</span>}
  </div>
);
