import { CHROM_THICKNESS } from "@/src/constants";
import type { ChrBar, QuerySlot } from "@/types";
import { bpToPx } from "@/src/components/visualizationTab/utils";

interface CentromereMarksProps {
  bars: (ChrBar | QuerySlot)[];
  positions: Map<string, number[]>;
  rowY: number;
  size?: number;
  color?: string;
}

const isChrBar = (bar: ChrBar | QuerySlot): bar is ChrBar => bar.kind === "chr";

export const CentromereMarks = ({ bars, positions, rowY, size = 8, color = "red" }: CentromereMarksProps) => {
  if (positions.size === 0) return null;

  const h = size / 2;
  const cy = rowY + CHROM_THICKNESS / 2;
  const marks: JSX.Element[] = [];
  for (const bar of bars) {
    if (!isChrBar(bar)) continue;

    const ps = positions.get(bar.chr);
    if (!ps) continue;

    const barEndBp = bar.p1 + bar.bpLen;
    for (let i = 0; i < ps.length; i++) {
      const bp = ps[i];
      if (bp < bar.p1 || bp > barEndBp) continue;

      const cx = bpToPx(bar, bp);
      marks.push(
        <g key={`${bar.chr}-${i}`}>
          <line x1={cx - h} x2={cx + h} y1={cy - h} y2={cy + h} />
          <line x1={cx - h} x2={cx + h} y1={cy + h} y2={cy - h} />
        </g>
      );
    }
  }

  if (marks.length === 0) return null;
  return (
    <g stroke={color} strokeWidth={1} strokeLinecap="square">
      {marks}
    </g>
  );
};
