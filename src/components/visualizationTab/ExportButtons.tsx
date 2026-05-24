import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { exportPng, exportSvg, triggerDownload } from "@/src/components/visualizationTab/utils";
import {
  buildNotableEventsCsv,
  downloadPredictedCentromeresCsv,
} from "@/src/components/visualizationTab/batchExport";

interface ExportButtonsProps {
  svgRef: RefObject<SVGSVGElement | null>;
  filenameBase: string;
}

const exportNotableEventsCsv = (filename: string): void => {
  const csv = buildNotableEventsCsv();
  triggerDownload(new Blob([csv], { type: "text/csv" }), filename);
};

export const ExportButtons = ({ svgRef, filenameBase }: ExportButtonsProps) => (
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
    <button
      className={styles.exportBtn}
      onClick={() => exportNotableEventsCsv(`${filenameBase}.csv`)}
      type="button"
    >
      ↓ CSV
    </button>
    <button
      className={styles.exportBtn}
      onClick={() => downloadPredictedCentromeresCsv(`${filenameBase}_predicted.csv`)}
      type="button"
    >
      ↓ predicted
    </button>
  </div>
);
