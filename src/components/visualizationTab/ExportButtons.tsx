import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { exportPng, exportSvg } from "@/src/components/visualizationTab/utils";
import {
  downloadNotableEventsCsv,
  downloadPredictedCentromeresCsv,
} from "@/src/components/visualizationTab/batchExport";
import { snapshotFromStores } from "@/src/components/visualizationTab/snapshot";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";

interface ExportButtonsProps {
  svgRef: RefObject<SVGSVGElement | null>;
  filenameBase: string;
}

const onCsvClick = (filenameBase: string) => {
  const { pairs, baseName } = snapshotFromStores();
  downloadNotableEventsCsv(pairs, baseName, `${filenameBase}.csv`);
};

const onPredictedClick = (filenameBase: string) => {
  const { predicted } = snapshotFromStores();
  downloadPredictedCentromeresCsv(predicted, `${filenameBase}_predicted.csv`);
};

export const ExportButtons = ({ svgRef, filenameBase }: ExportButtonsProps) => {
  const showMarks = useVisualizationStore((s) => s.showMarks);
  return (
    <div className={styles.exportGroup}>
      <button
        className={styles.exportBtn}
        onClick={() => svgRef.current && exportSvg(svgRef.current, `${filenameBase}.svg`)}
        type="button"
      >
        ↓ SVG
      </button>
      <button
        className={styles.exportBtn}
        onClick={() => svgRef.current && exportPng(svgRef.current, `${filenameBase}.png`)}
        type="button"
      >
        ↓ PNG
      </button>
      <button className={styles.exportBtn} onClick={() => onCsvClick(filenameBase)} type="button">
        ↓ CSV
      </button>
      {showMarks && (
        <button className={styles.exportBtn} onClick={() => onPredictedClick(filenameBase)} type="button">
          ↓ predicted
        </button>
      )}
    </div>
  );
};
