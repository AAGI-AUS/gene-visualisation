import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import type { FilesHandler } from "@/types";
import styles from "./FileSlot.module.css";

interface DropZoneProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  onFilesLoad: FilesHandler;
}

export const DropZone = ({ label, onFilesLoad, ...props }: DropZoneProps) => {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDrag(true);
  };

  const onDragLeave = () => {
    setDrag(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    onFilesLoad(e.dataTransfer.files);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFilesLoad(e.target.files);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div
      className={`${styles.dropZone} ${drag ? styles.dragOver : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.sub}>drop .bed/.tsv or click</span>
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        accept=".bed,.tsv,.txt"
        onChange={onChange}
        {...props}
      />
    </div>
  );
};
