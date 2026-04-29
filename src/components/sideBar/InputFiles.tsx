import { useAppStore } from "@/src/store/useAppStore";
import styles from "./Sidebar.module.css";
import { FileSlot } from "@/src/components/sideBar/FileSlot";

export function InputFiles() {
  const base = useAppStore((s) => s.base);
  const setBase = useAppStore((s) => s.setBase);
  const queryFiles = useAppStore((s) => s.queryFiles);
  const setQueryFile = useAppStore((s) => s.setQueryFiles);
  const clearBase = useAppStore((s) => s.clearBase);
  const clearQuery = useAppStore((s) => s.clearQuery);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>Input Files</div>
      <div className={styles.panelBody}>
        <div className={styles.slotLabel}>Baseline</div>
        <FileSlot filename={base?.name} onLoad={setBase} onClear={clearBase} />
        <div className={styles.slotLabel}>Query</div>
        {queryFiles.map((qf, i) => (
          <FileSlot key={i} filename={qf.name} onClear={() => clearQuery(i)} />
        ))}
        <FileSlot onLoad={setQueryFile} />
      </div>
    </div>
  );
}
