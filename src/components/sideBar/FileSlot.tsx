import type { FilesHandler } from "@/types";
import styles from "./FileSlot.module.css";
import { DropZone } from "@/src/components/sideBar/DropZone";

interface FileSlotProps extends React.InputHTMLAttributes<HTMLInputElement> {
  filename?: string | null;
  onFilesLoad?: FilesHandler;
  onClear?: () => void;
}

export const FileSlot = ({ filename, onFilesLoad, onClear, ...inputProps }: FileSlotProps) => (
  <div style={{ marginBottom: 10 }}>
    {filename ? (
      <div className={styles.fileLoaded}>
        <span className={styles.dot}>●</span>
        <span className={styles.fileName}>{filename}</span>
        <button className={styles.clearBtn} onClick={onClear} type="button">
          ✕
        </button>
      </div>
    ) : (
      onFilesLoad && <DropZone label="Select bed file" onFilesLoad={onFilesLoad} {...inputProps} />
    )}
  </div>
);
