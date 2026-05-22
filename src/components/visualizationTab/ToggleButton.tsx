import styles from "./VisualizationTab.module.css";

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  text: string;
}

export const ToggleButton = ({ active, onClick, text }: ToggleButtonProps) => (
  <button className={`${styles.toggleBtn} ${active ? styles.toggleBtnOn : ""}`} onClick={onClick} type="button">
    <span className={styles.toggleDot} />
    {text}
  </button>
);
