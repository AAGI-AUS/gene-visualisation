import type { DragEvent, ChangeEvent } from "react";
import { useRef, useState } from "react";
import type { FilesHandler } from "@/types";
import styles from "./FileSlot.module.css";

interface DropZoneProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  onFilesLoad: FilesHandler;
}

const DEFAULT_ACCEPT = ".bed,.tsv";

const formatAcceptHint = (accept: string): string =>
  accept
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");

export const DropZone = ({ label, onFilesLoad, accept = DEFAULT_ACCEPT, ...props }: DropZoneProps) => {
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
      <span className={styles.sub}>drop {formatAcceptHint(accept)} or click</span>
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        accept={accept}
        onChange={onChange}
        {...props}
      />
    </div>
  );
};
