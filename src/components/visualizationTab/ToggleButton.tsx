import styles from "./VisualizationTab.module.css";
import type { HelpAlign } from "@/src/help";
import { helpProps } from "@/src/help";

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  text: string;
  help?: string;
  helpAlign?: HelpAlign;
}

export const ToggleButton = ({ active, onClick, text, help, helpAlign }: ToggleButtonProps) => (
  <button className={`${styles.toggleBtn} ${active ? styles.toggleBtnOn : ""}`} onClick={onClick} type="button">
    <span className={styles.toggleDot} />
    <span {...helpProps(help, helpAlign)}>{text}</span>
  </button>
);
