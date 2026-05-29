import type { FilesHandler } from "@/types";
import styles from "./FileSlot.module.css";
import { DropZone } from "@/src/components/sideBar/DropZone";

interface FileSlotProps extends React.InputHTMLAttributes<HTMLInputElement> {
  filename?: string | null;
  onFilesLoad?: FilesHandler;
  onClear?: () => void;
  onSwap?: () => void;
}

export const FileSlot = ({ filename, onFilesLoad, onClear, onSwap, ...inputProps }: FileSlotProps) => (
  <div style={{ marginBottom: 10 }}>
    {filename ? (
      <div className={styles.fileLoaded}>
        <span className={styles.glyph}>ᛝ</span>
        <span className={styles.fileName}>{filename}</span>
        {onSwap && (
          <button
            className={styles.swapBtn}
            onClick={onSwap}
            type="button"
            title="Use as baseline (swap with current base)"
          >
            🡅<span>make base</span>
          </button>
        )}
        <button className={styles.clearBtn} onClick={onClear} type="button">
          ✕
        </button>
      </div>
    ) : (
      onFilesLoad && <DropZone label="Select bed file" onFilesLoad={onFilesLoad} {...inputProps} />
    )}
  </div>
);
