import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import type { BedFile } from "@/types";
import styles from "./FileSlot.module.css";
import { parseBED, readFileAsText } from "@/src/utils";

interface DropZoneProps {
  label: string;
  onLoad: (file: BedFile) => void;
}

export function DropZone({ label, onLoad }: DropZoneProps) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    const text = await readFileAsText(file);
    const rows = parseBED(text);
    onLoad({ name: file.name, rows });
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDrag(true);
  }
  function onDragLeave() {
    setDrag(false);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    handleFile(e.dataTransfer.files[0]);
  }
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0]);
  }

  return (
    <div
      className={`${styles.dropZone} ${drag ? styles.dragOver : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <span className={styles.icon}>⬡</span>
      <span className={styles.label}>{label}</span>
      <span className={styles.sub}>drop .bed / .tsv or click</span>
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        accept=".bed,.tsv,.txt"
        onChange={onChange}
      />
    </div>
  );
}
