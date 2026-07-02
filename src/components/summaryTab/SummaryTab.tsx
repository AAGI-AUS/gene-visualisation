import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SummaryTab.module.css";
import { useAppStore } from "@/src/store/useAppStore";
import type { SummaryChunk } from "@/src/store/useAppStore";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { exportSvg } from "@/src/components/visualizationTab/utils";
import { NumberControl } from "@/src/components/visualizationTab/NumberControl";
import { FONT } from "@/src/constants";
import { SVGText } from "@/src/components/base/svg";

const BAR_W = 44;
const BAR_GAP = 5;
const BAR_H = 520;
const PAD_X = 16;
const AXIS_W = 46;
const LEGEND_H = 44;
const GRAD_W = 220;
const GRAD_H = 12;
const CORE_COLOR = "red";
const AXIS_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const OVERALL_GAP = 8;
const OVERALL_BAR_W = 67;
const ACC_COLOR = "lightgrey";

const gray = (coverage: number) => {
  const c = Math.round(255 * (1 - coverage));
  return `rgb(${c},${c},${c})`;
};

const axisX = PAD_X + AXIS_W;
const yScale = (f: number) => LEGEND_H + BAR_H - f * BAR_H;

// Resolve after a paint so the just-added bar is on screen before the next compute blocks.
const afterPaint = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))));

export const SummaryTab = () => {
  const buildSummaryBar = useAppStore((s) => s.buildSummaryBar);
  const base = useAppStore((s) => s.base);
  const chromosomes = useAppStore((s) => s.chromosomes);
  const queryFiles = useAppStore((s) => s.queryFiles);
  const groupThreshold = useAppStore((s) => s.groupThreshold);
  const gapBp = useVisualizationStore((s) => s.gapBp);
  const hiddenThreshold = useVisualizationStore((s) => s.hiddenThreshold);
  const fontSize = useVisualizationStore((s) => s.fontSize);
  const setGapBp = useVisualizationStore((s) => s.setGapBp);
  const setHiddenThreshold = useVisualizationStore((s) => s.setHiddenThreshold);
  const setFontSize = useVisualizationStore((s) => s.setFontSize);

  const svgRef = useRef<SVGSVGElement>(null);
  const [chunksByChr, setChunksByChr] = useState<Record<string, SummaryChunk[]>>({});

  // Each bar scales independently: that chromosome's own max bp (from the base
  // BED file) sits at the top of its bar.
  const chrMaxBp = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of base?.rows ?? []) if (r.p2 > (m[r.chromosome] ?? 0)) m[r.chromosome] = r.p2;
    return m;
  }, [base]);

  useEffect(() => {
    let cancelled = false;
    setChunksByChr({});
    (async () => {
      for (const chr of chromosomes) {
        const bar = await buildSummaryBar(chr, 1000 * gapBp, hiddenThreshold);
        if (cancelled) return;
        setChunksByChr((prev) => ({ ...prev, [chr]: bar.chunks }));
        await afterPaint(); // let the browser paint this bar before the next computation
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildSummaryBar, base, queryFiles, groupThreshold, gapBp, hiddenThreshold, chromosomes]);

  if (!chromosomes.length) return <div className={styles.state}>No data to summarize</div>;

  const done = chromosomes.filter((chr) => chunksByChr[chr]).length;
  const computing = done < chromosomes.length;

  const x0 = axisX + 6;
  const barX = (k: number) => x0 + k * (BAR_W + BAR_GAP);
  const labelH = fontSize + 12;
  const barsRight = x0 + chromosomes.length * BAR_W + Math.max(chromosomes.length - 1, 0) * BAR_GAP;

  // Genome-wide core fraction: total core bp / total chromosome bp, summed over
  // the chromosomes computed so far so numerator and denominator stay aligned.
  let coreBpSum = 0;
  let maxBpSum = 0;
  for (const chr of chromosomes) {
    const chunks = chunksByChr[chr];
    if (!chunks) continue;
    coreBpSum += chunks.reduce((sum, c) => sum + c.coverage * (c.bp2 - c.bp1), 0);
    maxBpSum += chrMaxBp[chr] || 0;
  }
  const overallCore = maxBpSum > 0 ? Math.min(coreBpSum / maxBpSum, 1) : 0;

  const overallX = barsRight + OVERALL_GAP;
  const width = Math.max(overallX + OVERALL_BAR_W + PAD_X, GRAD_W + 80);
  const height = LEGEND_H + BAR_H + labelH;

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <NumberControl
            label="Gap"
            unit="kbp"
            value={gapBp}
            onChange={setGapBp}
            step={10}
            min={10}
            width={55}
          />
          <NumberControl
            label="Hidden threshold"
            unit="genes"
            value={hiddenThreshold}
            onChange={setHiddenThreshold}
          />
          <NumberControl label="Font" value={fontSize} onChange={setFontSize} min={6} />
        </div>
        <button
          className={styles.exportBtn}
          type="button"
          disabled={computing}
          onClick={() => svgRef.current && exportSvg(svgRef.current, "baseline-summary.svg")}
        >
          Export SVG
        </button>
      </div>

      <div className={styles.canvasWrap}>
        <div className={styles.stage}>
          <svg ref={svgRef} fontFamily={FONT} className={styles.svg} {...{ width, height, fontSize }}>
            <rect width={width} height={height} fill="white" />

            <CoreDensityLegend width={width} fontSize={fontSize} />
            <PercentCoreAxis fontSize={fontSize} />

            {chromosomes.map((chr, k) => (
              <SummaryBar
                key={chr}
                chr={chr}
                x={barX(k)}
                chunks={chunksByChr[chr] ?? []}
                chrMax={chrMaxBp[chr] || 1}
                fontSize={fontSize}
              />
            ))}

            {!computing && <OverallBar x={overallX} coreFraction={overallCore} fontSize={fontSize} />}
          </svg>

          {computing && (
            <div
              className={styles.shimmer}
              style={{
                left: barX(done),
                top: LEGEND_H,
                width: BAR_W,
                height: BAR_H,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface CoreDensityLegendProps {
  width: number;
  fontSize: number;
}

// White-to-black gradient legend, centered at the top of the figure.
const CoreDensityLegend = ({ width, fontSize }: CoreDensityLegendProps) => (
  <>
    <defs>
      <linearGradient id="summaryGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="white" />
        <stop offset="1" stopColor="black" />
      </linearGradient>
    </defs>
    <SVGText t="Core density" x={width / 2} y={12} textAnchor="middle" fontSize={fontSize - 2} fill="#475569" />
    <rect
      x={(width - GRAD_W) / 2}
      y={18}
      width={GRAD_W}
      height={GRAD_H}
      fill="url(#summaryGrad)"
      stroke="lightgrey"
      strokeWidth={1}
    />
    <SVGText t="0" x={(width - GRAD_W) / 2 - 6} y={GRAD_H + 16} textAnchor="end" fill="#475569" />
    <SVGText t="1" x={(width + GRAD_W) / 2 + 6} y={GRAD_H + 16} textAnchor="start" fill="#475569" />
  </>
);

interface PercentCoreAxisProps {
  fontSize: number;
}

const rotate90 = `translate(${PAD_X - 2}, ${LEGEND_H + BAR_H / 2}) rotate(-90)`;
const PercentCoreAxis = ({ fontSize }: PercentCoreAxisProps) => (
  <>
    <SVGText t="% of core" transform={rotate90} textAnchor="middle" fill={CORE_COLOR} />
    <line x1={axisX} x2={axisX} y1={yScale(1)} y2={yScale(0)} stroke={CORE_COLOR} strokeWidth={1} />
    {AXIS_TICKS.map((t) => (
      <g key={t}>
        <line x1={axisX - 4} x2={axisX} y1={yScale(t)} y2={yScale(t)} stroke={CORE_COLOR} strokeWidth={1} />
        <text x={axisX - 7} y={yScale(t) + fontSize / 3} textAnchor="end" fill={CORE_COLOR}>
          {t.toFixed(1)}
        </text>
      </g>
    ))}
  </>
);

interface SummaryBarProps {
  chr: string;
  x: number;
  chunks: SummaryChunk[];
  chrMax: number;
  fontSize: number;
}

// One chromosome's bar: grayscale core-density chunks, outline, % of core marker, label.
const SummaryBar = ({ chr, x, chunks, chrMax, fontSize }: SummaryBarProps) => {
  const coreBp = chunks.reduce((sum, c) => sum + c.coverage * (c.bp2 - c.bp1), 0);
  const coreFraction = Math.min(coreBp / chrMax, 1);
  const y = yScale(coreFraction);
  const chromY = LEGEND_H + BAR_H + fontSize + 2;
  return (
    <g>
      {chunks.map((c, j) => {
        const h = ((c.bp2 - c.bp1) / chrMax) * BAR_H;
        return (
          h >= 1 && (
            <rect key={j} x={x} y={yScale(c.bp2 / chrMax)} width={BAR_W} height={h} fill={gray(c.coverage)} />
          )
        );
      })}
      <rect x={x} y={LEGEND_H} width={BAR_W} height={BAR_H} fill="none" stroke="black" strokeWidth={1} />
      {chunks.length > 0 && <line x1={x} x2={x + BAR_W} y1={y} y2={y} stroke={CORE_COLOR} strokeWidth={1.5} />}
      <SVGText t={chr} x={x + BAR_W / 2} y={chromY} textAnchor="middle" fill="black" />
    </g>
  );
};

interface OverallBarProps {
  x: number;
  coreFraction: number;
  fontSize: number;
}

// Genome-wide core/accessory: a fat bar filled black to the core fraction (grey
// above), with the two percentages as big numbers to its right.
const OverallBar = ({ x, coreFraction, fontSize }: OverallBarProps) => {
  const coreH = coreFraction * BAR_H;
  const corePct = Math.round(coreFraction * 100);
  const bigFont = Math.round(fontSize * 1.8);
  const centerX = x + OVERALL_BAR_W / 2;
  const labelY = LEGEND_H + BAR_H + fontSize + 2;
  const labelSize = Math.min(11, fontSize);
  return (
    <g textAnchor="middle">
      <rect x={x} y={LEGEND_H} width={OVERALL_BAR_W} height={BAR_H} stroke="black" strokeWidth={1} />
      <rect x={x} y={LEGEND_H} width={OVERALL_BAR_W} height={BAR_H - coreH} fill={ACC_COLOR} />
      <text x={centerX} y={LEGEND_H + bigFont} fontSize={bigFont} fontWeight="bold" fill="grey">
        {100 - corePct}%
      </text>
      <SVGText
        t="Accessory"
        x={centerX}
        y={LEGEND_H + bigFont + labelSize + 2}
        fill="grey"
        fontSize={labelSize}
      />
      <text x={centerX} y={LEGEND_H + BAR_H - fontSize} fontSize={bigFont} fontWeight="bold" fill="white">
        {corePct}%
      </text>
      <SVGText t="Core" x={centerX} y={LEGEND_H + BAR_H - 6} fill="white" fontSize={labelSize} />
      <SVGText t="Overall" x={x + OVERALL_BAR_W / 2} y={labelY} fill="black" />
    </g>
  );
};
