import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { exportPng, exportSvg } from "@/src/components/visualizationTab/utils";
import {
  downloadNotableEventsCsv,
  downloadPredictedCentromeresCsv,
} from "@/src/components/visualizationTab/batchExport";

interface ExportButtonsProps {
  svgRef: RefObject<SVGSVGElement | null>;
  filenameBase: string;
}

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
      onClick={() => downloadNotableEventsCsv(`${filenameBase}.csv`)}
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
