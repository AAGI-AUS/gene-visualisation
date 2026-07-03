import { useAppStore } from "@/src/store/useAppStore";
import styles from "./Sidebar.module.css";

// The RUN button, reusable wherever an analysis can be triggered.
export const RunButton = () => {
  const base = useAppStore((s) => s.base);
  const queryFiles = useAppStore((s) => s.queryFiles);
  const running = useAppStore((s) => s.running);
  const batching = useAppStore((s) => s.batching);
  const runAnalysis = useAppStore((s) => s.runAnalysis);

  const canRun = Boolean(base && queryFiles?.[0]) && !running;

  return (
    <button className={styles.runBtn} disabled={!canRun || batching} onClick={runAnalysis} type="button">
      {running ? "RUNNING..." : "▶ RUN"}
    </button>
  );
};
