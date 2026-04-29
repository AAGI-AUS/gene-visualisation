import { type RefObject } from "react";
import type { ResultRow } from "@/types";
import styles from "./VisualizationTab.module.css";
import { useAppStore } from "@/src/store/useAppStore";
import { LinePair } from "@/src/components/visualizationTab/LinePair";

interface SyntenyCanvasProps {
  data: ResultRow[][];
  svgRef: RefObject<SVGSVGElement>;
  width: number;
  height: number;
}

export function SyntenyCanvas({ data, svgRef, width, height }: SyntenyCanvasProps) {
  const queryFiles = useAppStore((s) => s.queryFiles);

  return (
    <svg ref={svgRef} className={styles.svgCanvas} width={width} height={height}>
      <rect width={width} height={height} fill="white" />
      {data.map((d, i) => (
        <LinePair data={d} queryName={queryFiles[i].name} i={i} />
      ))}
    </svg>
  );
}
