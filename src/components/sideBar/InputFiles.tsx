import { useState } from "react";
import { useAppStore } from "@/src/store/useAppStore";
import styles from "./Sidebar.module.css";
import { FileSlot } from "@/src/components/sideBar/FileSlot";

export const InputFiles = () => {
  const base = useAppStore((s) => s.base);
  const setBase = useAppStore((s) => s.setBase);
  const queryFiles = useAppStore((s) => s.queryFiles);
  const setQueryFiles = useAppStore((s) => s.setQueryFiles);
  const clearBase = useAppStore((s) => s.clearBase);
  const clearQuery = useAppStore((s) => s.clearQuery);
  const reorderQuery = useAppStore((s) => s.reorderQuery);
  const swapBaseWithQuery = useAppStore((s) => s.swapBaseWithQuery);
  const centromereName = useAppStore((s) => s.centromereName);
  const setCentromere = useAppStore((s) => s.setCentromere);
  const clearCentromere = useAppStore((s) => s.clearCentromere);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const resetDrag = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const validDrop =
    dragIndex !== null && dropIndex !== null && dropIndex !== dragIndex && dropIndex !== dragIndex + 1;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>Input Files</div>
      <div className={styles.panelBody}>
        <div className={styles.slotLabel}>Baseline</div>
        <FileSlot filename={base?.name} onFilesLoad={setBase} onClear={clearBase} />

        <div className={styles.slotLabel}>Query</div>
        {queryFiles.map((qf, i) => (
          <div
            key={i}
            draggable
            className={`${styles.draggable} ${dragIndex === i ? styles.dragging : ""} ${
              validDrop && dropIndex === i ? styles.dragOverAbove : ""
            } ${validDrop && dropIndex === i + 1 && i === queryFiles.length - 1 ? styles.dragOverBelow : ""}`}
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = e.currentTarget.getBoundingClientRect();
              setDropIndex(e.clientY < rect.top + rect.height / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dropIndex !== null) {
                const to = dragIndex < dropIndex ? dropIndex - 1 : dropIndex;
                if (dragIndex !== to) reorderQuery(dragIndex, to);
              }
              resetDrag();
            }}
            onDragEnd={resetDrag}
          >
            <FileSlot filename={qf.name} onClear={() => clearQuery(i)} onSwap={() => swapBaseWithQuery(i)} />
          </div>
        ))}
        <FileSlot onFilesLoad={setQueryFiles} multiple />

        <div className={styles.slotLabel}>Centromere (optional)</div>
        <FileSlot
          filename={centromereName}
          onFilesLoad={setCentromere}
          onClear={clearCentromere}
          accept=".csv"
        />
      </div>
    </div>
  );
};
