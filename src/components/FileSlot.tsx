import type { BedFile } from "@/types";
import styles from "./FileSlot.module.css";
import { DropZone } from "@/src/components/DropZone";

interface FileSlotProps {
  label: string;
  file: BedFile | null;
  onLoad: (file: BedFile) => void;
  onClear: () => void;
}

export function FileSlot({ label, file, onLoad, onClear }: FileSlotProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className={styles.slotLabel}>{label}</div>
      {file ? (
        <div className={styles.fileLoaded}>
          <span className={styles.dot}>●</span>
          <span className={styles.fileName}>{file.name}</span>
          <span className={styles.rowCount}>{file.rows.length} rows</span>
          <button className={styles.clearBtn} onClick={onClear} type="button">
            ✕
          </button>
        </div>
      ) : (
        <DropZone label={`Load ${label}`} onLoad={onLoad} />
      )}
    </div>
  );
}
