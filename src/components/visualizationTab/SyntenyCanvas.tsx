import { type RefObject } from "react";
import styles from "./VisualizationTab.module.css";
import { Result } from "@/src/store/useAppStore";
import { LinePair } from "@/src/components/visualizationTab/LinePair";

interface SyntenyCanvasProps {
  data: Result;
  svgRef: RefObject<SVGSVGElement>;
  width: number;
  height: number;
}

export const SyntenyCanvas = ({ data, svgRef, width, height }: SyntenyCanvasProps) => (
  <svg ref={svgRef} className={styles.svgCanvas} width={width} height={height}>
    <rect width={width} height={height} fill="white" />
    {data.map((d, i) => (
      <LinePair key={i} data={d.rows} queryName={d.name} i={i} />
    ))}
  </svg>
);
