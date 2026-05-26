import styles from "./Sidebar.module.css";
import { InputFiles } from "@/src/components/sideBar/InputFiles";
import { Parameters } from "@/src/components/sideBar/Parameters";

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar (root)
// ─────────────────────────────────────────────────────────────────────────────

export const Sidebar = () => (
  <aside className={styles.sidebar}>
    <InputFiles />
    <Parameters />
  </aside>
);
