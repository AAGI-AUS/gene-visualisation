import type { RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { exportPng, exportSvg } from "@/src/components/visualizationTab/utils";

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
  </div>
);
