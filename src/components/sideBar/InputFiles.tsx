import { useAppStore } from "@/src/store/useAppStore";
import styles from "./Sidebar.module.css";
import { FileSlot } from "@/src/components/sideBar/FileSlot";

export function InputFiles() {
  const baseFile = useAppStore((s) => s.baseFile);
  const queryFile = useAppStore((s) => s.queryFile);
  const setBaseFile = useAppStore((s) => s.setBaseFile);
  const setQueryFile = useAppStore((s) => s.setQueryFile);
  const clearBase = useAppStore((s) => s.clearBase);
  const clearQuery = useAppStore((s) => s.clearQuery);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>Input Files</div>
      <div className={styles.panelBody}>
        <FileSlot label="Baseline" file={baseFile} onLoad={setBaseFile} onClear={clearBase} />
        <FileSlot label="Query" file={queryFile} onLoad={setQueryFile} onClear={clearQuery} />
      </div>
    </div>
  );
}
