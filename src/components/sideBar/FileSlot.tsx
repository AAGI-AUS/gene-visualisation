import type { FileHandler } from "@/types";
import styles from "./FileSlot.module.css";
import { DropZone } from "@/src/components/sideBar/DropZone";

interface FileSlotProps {
  filename?: string | null;
  onLoad?: FileHandler;
  onClear?: () => void;
}

export function FileSlot({ filename, onLoad, onClear }: FileSlotProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      {filename ? (
        <div className={styles.fileLoaded}>
          <span className={styles.dot}>●</span>
          <span className={styles.fileName}>{filename}</span>
          {/* <span className={styles.rowCount}>{filename.rows.length} rows</span> */}
          <button className={styles.clearBtn} onClick={onClear} type="button">
            ✕
          </button>
        </div>
      ) : (
        onLoad && <DropZone label="Select bed file" onLoad={onLoad} />
      )}
    </div>
  );
}
