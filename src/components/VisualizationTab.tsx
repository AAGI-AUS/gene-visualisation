import { useRef, useState, useMemo, useCallback, useEffect, type MouseEvent } from "react";
import { Group } from "@visx/group";
import type { ResultRow } from "@/types";
import styles from "./VisualizationTab.module.css";
import { withinThreshold } from "@/src/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

type ChunkEvent = "synteny" | "inversion" | "translocation" | "translocation+inversion";

const CHUNKCOLOR: Record<ChunkEvent, string> = {
  synteny: "#3b82f6",
  inversion: "#f59e0b",
  translocation: "#ef4444",
  "translocation+inversion": "#a855f7",
};
const CHUNKOPACITY: Record<ChunkEvent, number> = {
  synteny: 0.18,
  inversion: 0.55,
  translocation: 0.55,
  "translocation+inversion": 0.6,
};
const CHRPALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
  "#d946ef",
  "#0ea5e9",
  "#fb923c",
  "#a3e635",
];

const BARH = 22;
const RIBBONGAP = 7;
const ROWGAP = 150;
const PAD = { top: 44, bottom: 40, left: 90, right: 28 };
const FONT = "IBM Plex Mono, monospace";
const CHRGAPPX = 6;
/** Fixed pixel width of each "others" stub */
const OTHERSW = 32;
const OTHERSCOL = "#94a3b8";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

interface ChrBar {
  kind: "chr";
  chr: string;
  px: number;
  pw: number;
  bpLen: number;
  colorIdx: number;
}

interface OthersBar {
  kind: "others";
  /** Which base chromosome this stub represents (for routing lookup) */
  baseChr: string;
  side: "left" | "right";
  px: number;
  pw: number;
  targetX: number;
}

type QuerySlot = ChrBar | OthersBar;

interface BaseRow {
  label: string;
  bars: ChrBar[];
  y: number;
}

interface QueryRow {
  label: string;
  slots: QuerySlot[]; // only what's actually rendered, in display order
  y: number;
}

interface EventCounts {
  synteny: number;
  inversion: number;
  translocation: number;
  "translocation+inversion": number;
  total: number;
}

interface Chunk {
  id: string;
  chrBase: string;
  bp1Base: number;
  bp2Base: number;
  chrQuery: string;
  bp1Query: number;
  bp2Query: number;
  dominant: ChunkEvent;
  counts: EventCounts;
  rows: ResultRow[];
  isInvert: boolean;
  isOthers: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function rowCategory(r: ResultRow): ChunkEvent {
  if (r.isTranslocation && r.isInvert) return "translocation+inversion";
  if (r.isTranslocation) return "translocation";
  if (r.isInvert) return "inversion";
  return "synteny";
}

function zeroCounts(): EventCounts {
  return {
    synteny: 0,
    inversion: 0,
    translocation: 0,
    "translocation+inversion": 0,
    total: 0,
  };
}

function dominantEvent(c: EventCounts): ChunkEvent {
  const keys: ChunkEvent[] = ["synteny", "inversion", "translocation", "translocation+inversion"];
  return keys.reduce((b, k) => (c[k] > c[b] ? k : b), keys[0]);
}

function chunkRows(rows: ResultRow[], gapBp: number): Chunk[] {
  if (!rows.length) return [];
  const out: Chunk[] = [];

  const nonTranslocations: ResultRow[] = [];
  const translocations: ResultRow[] = [];
  rows.forEach((r) => {
    if (r.isTranslocation) translocations.push(r);
    else nonTranslocations.push(r);
  });

  let group = [nonTranslocations[0]];
  for (let i = 1; i < nonTranslocations.length; i++) {
    const first = group[0];
    const firstP1Query = first.isInvert ? first.p2Query : first.p1Query;
    const prev = group[group.length - 1];
    const cur = nonTranslocations[i];
    const curP2Query = cur.isInvert ? cur.p1Query : cur.p2Query;

    const projectedBpBase = cur.p2Base - first.p1Base;
    const projectedBpQuery = Math.abs(curP2Query - firstP1Query);
    const withinRange = withinThreshold(projectedBpQuery, projectedBpBase);
    const gap = cur.p1Base - prev.p2Base;
    if (gap <= gapBp && withinRange) {
      group.push(cur);
    } else {
      out.push(buildChunk(group, out.length));
      group = [cur];
    }
  }
  out.push(buildChunk(group, out.length));

  group = [translocations[0]];
  for (let i = 1; i < translocations.length; i++) {
    // const first = group[0];
    // const firstP1Query = first.isInvert ? first.p2Query : first.p1Query;
    const prev = group[group.length - 1];
    const cur = translocations[i];
    // const curP2Query = cur.isInvert ? cur.p1Query : cur.p2Query;

    // const projectedBpBase = cur.p2Base - first.p1Base;
    // const projectedBpQuery = Math.abs(curP2Query - firstP1Query);
    // const withinRange = withinThreshold(projectedBpQuery, projectedBpBase);
    const gap = cur.p1Base - prev.p2Base;
    // if (gap <= gapBp && withinRange) {
    if (gap <= gapBp) {
      group.push(cur);
    } else {
      out.push(buildChunk(group, out.length));
      group = [cur];
    }
  }
  out.push(buildChunk(group, out.length));

  return out;
}

function buildChunk(rows: ResultRow[], idx: number): Chunk {
  const chrBase = rows[0].chromosomeBase;
  const bp1Base = Math.min(...rows.map((r) => r.p1Base));
  const bp2Base = Math.max(...rows.map((r) => r.p2Base));

  const counts = zeroCounts();
  for (const r of rows) {
    counts[rowCategory(r)]++;
    counts.total++;
  }
  const dominant = dominantEvent(counts);

  const qCnt: Record<string, number> = {};
  for (const r of rows) if (r.chromosomeQuery) qCnt[r.chromosomeQuery] = (qCnt[r.chromosomeQuery] ?? 0) + 1;
  const chrQuery = Object.entries(qCnt).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  const qRows = rows.filter((r) => r.chromosomeQuery === chrQuery && r.p1Query != null);
  const bp1Query = qRows.length ? Math.min(...qRows.map((r) => r.p1Query!)) : 0;
  const bp2Query = qRows.length ? Math.max(...qRows.map((r) => r.p2Query!)) : 0;
  const isInvert = qRows.filter((r) => r.isInvert).length > qRows.length / 2;
  const isOthers = rows.filter((r) => r.groupedQuery === "others").length > rows.length / 2;

  return {
    id: `${chrBase}-${idx}`,
    chrBase,
    bp1Base,
    bp2Base,
    chrQuery,
    bp1Query,
    bp2Query,
    dominant,
    counts,
    rows,
    isInvert,
    isOthers,
  };
}

/** Build the base genome row — always shows all base chromosomes proportionally. */
function buildBaseRow(
  chrMaxBp: Map<string, number>,
  chrOrder: string[],
  label: string,
  y: number,
  availW: number
): BaseRow {
  const n = chrOrder.length;
  if (n === 0) return { label, bars: [], y };

  const totalBp = chrOrder.reduce((s, c) => s + (chrMaxBp.get(c) ?? 1), 0);
  const gapBudget = (n - 1) * CHRGAPPX;
  const pxPerBp = Math.max(availW - gapBudget, n) / Math.max(totalBp, 1);

  let cursor = 0;
  const bars: ChrBar[] = chrOrder.map((chr, i) => {
    const bpLen = Math.max(chrMaxBp.get(chr) ?? 1, 1);
    const pw = bpLen * pxPerBp;
    const bar: ChrBar = {
      kind: "chr",
      chr,
      px: cursor,
      pw,
      bpLen,
      colorIdx: i % CHRPALETTE.length,
    };
    cursor += pw + (i < n - 1 ? CHRGAPPX : 0);
    return bar;
  });

  return { label, bars, y };
}

/**
 * Build the query row layout from a pre-computed list of slots.
 *
 * `slots` is an ordered list of items to render:
 *   - ChrBar descriptors (chr + bpLen, px/pw filled in here)
 *   - OthersBar descriptors (baseChr + side, px/pw filled in here)
 *
 * Chr bars are sized proportionally to their bpLen.
 * Others bars are fixed OTHERSW px.
 * Items are separated by CHRGAPPX.
 */
function buildQueryRow(
  slotSpecs: Array<
    | { kind: "chr"; chr: string; bpLen: number; colorIdx: number }
    | { kind: "others"; baseChr: string; side: "left" | "right" }
  >,
  label: string,
  y: number,
  availW: number
): QueryRow {
  const n = slotSpecs.length;
  if (n === 0) return { label, slots: [], y };

  const totalBpForChr = slotSpecs
    .filter((s) => s.kind === "chr")
    .reduce((sum, s) => sum + (s as { bpLen: number }).bpLen, 0);

  const nOthers = slotSpecs.filter((s) => s.kind === "others").length;
  const othersPx = nOthers * OTHERSW;
  const gapPx = (n - 1) * CHRGAPPX;
  const chrBudget = Math.max(availW - othersPx - gapPx, slotSpecs.filter((s) => s.kind === "chr").length * 2);
  const pxPerBp = totalBpForChr > 0 ? chrBudget / totalBpForChr : 1;

  let cursor = 0;
  const slots: QuerySlot[] = slotSpecs.map((spec, i) => {
    let slot: QuerySlot;
    if (spec.kind === "chr") {
      const pw = spec.bpLen * pxPerBp;
      slot = {
        kind: "chr",
        chr: spec.chr,
        px: cursor,
        pw,
        bpLen: spec.bpLen,
        colorIdx: spec.colorIdx,
      };
      cursor += pw;
    } else {
      const px = cursor;
      slot = {
        kind: "others",
        baseChr: spec.baseChr,
        side: spec.side,
        px,
        pw: OTHERSW,
        targetX: px + OTHERSW / 2,
      };
      cursor += OTHERSW;
    }
    if (i < n - 1) cursor += CHRGAPPX;
    return slot;
  });

  return { label, slots, y };
}

function bpToPx(bar: ChrBar, bp: number): number {
  const frac = Math.min(Math.max(bp / bar.bpLen, 0), 1);
  return bar.px + frac * bar.pw;
}

function ribbonPath(
  baseX1: number,
  baseX2: number,
  y1: number,
  queryX1: number,
  queryX2: number,
  y2: number,
  minWidth = 0
): string {
  // enforce minimum width for top segment
  if (Math.abs(baseX2 - baseX1) < minWidth) {
    const cx = (baseX1 + baseX2) / 2;
    baseX1 = cx - minWidth / 2;
    baseX2 = cx + minWidth / 2;
  }

  // enforce minimum width for bottom segment
  if (Math.abs(queryX2 - queryX1) < minWidth) {
    const cx = (queryX1 + queryX2) / 2;
    queryX1 = cx - minWidth / 2;
    queryX2 = cx + minWidth / 2;
  }

  const my = (y1 + y2) / 2;

  return [
    `M ${baseX1} ${y1}`,
    `C ${baseX1} ${my}, ${queryX1} ${my}, ${queryX1} ${y2}`,
    `L ${queryX2} ${y2}`,
    `C ${queryX2} ${my}, ${baseX2} ${my}, ${baseX2} ${y1}`,
    "Z",
  ].join(" ");
}

function pct(n: number, total: number) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : "0%";
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────

interface TooltipInfo {
  cx: number;
  cy: number;
  chunk: Chunk;
}

function TooltipContent({ chunk }: { chunk: Chunk }) {
  const { counts, dominant } = chunk;
  const bars: Array<{ key: ChunkEvent; label: string }> = [
    { key: "synteny", label: "Synteny" },
    { key: "inversion", label: "Inversion" },
    { key: "translocation", label: "Translocation" },
    { key: "translocation+inversion", label: "Trans+Inv" },
  ];
  return (
    <div className={styles.tooltipInner}>
      <div className={styles.tooltipHeader}>
        <span className={styles.tooltipDominant} style={{ color: CHUNKCOLOR[dominant] }}>
          {dominant}
          {chunk.isOthers ? " · others" : ""}
        </span>
        <span className={styles.tooltipCount}>{counts.total} genes</span>
      </div>

      <div className={styles.tooltipCoord}>
        <span className={styles.tooltipGenome}>base</span>
        <span>
          {chunk.chrBase}:{chunk.bp1Base.toLocaleString()}–{chunk.bp2Base.toLocaleString()}
        </span>
      </div>
      {chunk.isOthers ? (
        <div className={styles.tooltipCoord}>
          <span className={styles.tooltipGenome}>query</span>
          <span style={{ color: OTHERSCOL }}>grouped → others</span>
        </div>
      ) : chunk.chrQuery ? (
        <div className={styles.tooltipCoord}>
          <span className={styles.tooltipGenome}>query</span>
          <span>
            {chunk.chrQuery}:{chunk.bp1Query.toLocaleString()}–{chunk.bp2Query.toLocaleString()}
          </span>
        </div>
      ) : null}

      <div className={styles.tooltipDivider} />

      {bars.map(({ key, label }) => {
        const n = counts[key];
        if (!n) return null;
        return (
          <div className={styles.distRow} key={key}>
            <span className={styles.distLabel}>{label}</span>
            <div className={styles.distBarWrap}>
              <div
                className={styles.distBar}
                style={{
                  width: `${(n / counts.total) * 100}%`,
                  background: CHUNKCOLOR[key],
                }}
              />
            </div>
            <span className={styles.distN}>{n}</span>
            <span className={styles.distPct}>{pct(n, counts.total)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface VisualizationTabProps {
  data: ResultRow[];
  baseLabel?: string;
  queryLabel?: string;
}

export function VisualizationTab({
  data,
  baseLabel = "Baseline",
  queryLabel = "Query",
}: VisualizationTabProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [svgW, setSvgW] = useState(900);
  const [gapBp, setGapBp] = useState(50000);
  const [othersMode, setOthersMode] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [hoverChunk, setHoverChunk] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setSvgW(Math.max(w - 2, 400));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trackW = svgW - PAD.left - PAD.right;

  // ── 1. Collect chromosome extents from data ─────────────────────────────
  const { baseChrMax, baseChrOrder, queryChrMax, queryChrColorIdx } = useMemo(() => {
    const baseChrMax = new Map<string, number>();
    const baseChrOrder: string[] = [];
    const queryChrMax = new Map<string, number>();
    const queryChrColorIdx = new Map<string, number>();
    const seenBase = new Set<string>();
    const seenQuery = new Set<string>();
    let qi = 0;

    for (const r of data) {
      if (r.chromosomeBase && !seenBase.has(r.chromosomeBase)) {
        seenBase.add(r.chromosomeBase);
        baseChrOrder.push(r.chromosomeBase);
      }
      if (r.chromosomeBase)
        baseChrMax.set(r.chromosomeBase, Math.max(baseChrMax.get(r.chromosomeBase) ?? 0, r.p2Base));

      if (r.chromosomeQuery && !seenQuery.has(r.chromosomeQuery)) {
        seenQuery.add(r.chromosomeQuery);
        queryChrColorIdx.set(r.chromosomeQuery, qi++ % CHRPALETTE.length);
      }
      if (r.chromosomeQuery)
        queryChrMax.set(r.chromosomeQuery, Math.max(queryChrMax.get(r.chromosomeQuery) ?? 0, r.p2Query ?? 0));
    }
    return { baseChrMax, baseChrOrder, queryChrMax, queryChrColorIdx };
  }, [data]);

  // ── 2. Base row (always fixed) ──────────────────────────────────────────
  const baseRow = useMemo(
    () => buildBaseRow(baseChrMax, baseChrOrder, baseLabel, PAD.top, trackW),
    [baseChrMax, baseChrOrder, baseLabel, trackW]
  );

  // ── 3. Build chunks ─────────────────────────────────────────────────────
  const chunks = useMemo<Chunk[]>(() => {
    const valid = data.filter((r) => r.chromosomeQuery !== null && !r.isNoise);
    const byChr = new Map<string, ResultRow[]>();
    for (const r of valid) {
      const arr = byChr.get(r.chromosomeBase) ?? [];
      arr.push(r);
      byChr.set(r.chromosomeBase, arr);
    }
    const all: Chunk[] = [];
    byChr.forEach((rows) => {
      all.push(
        ...chunkRows(
          [...rows].sort((a, b) => a.p1Base - b.p1Base),
          gapBp
        )
      );
    });
    return all;
  }, [data, gapBp]);

  // ── 4. Determine query row layout from chunks ───────────────────────────
  //
  // Normal mode:  show only query chrs that receive at least one ribbon.
  // Others mode:  show only query chrs that receive at least one non-others ribbon,
  //               PLUS one "others" stub (left side) for each base chromosome that
  //               has at least one "others" chunk pointing FROM it.
  //
  // The slot order: others-left, real-chr-bars (in first-appearance order), others-right
  // — but we use a single global "others-left" and "others-right" stub per base chr
  //   that has others chunks, placed adjacent in the query row without gaps for
  //   chromosomes that don't appear.

  const queryRow = useMemo(() => {
    // Which query chrs get real (non-others) ribbons?
    const realChrs = new Set<string>();
    // Which base chrs have "others" chunks that need stubs?
    const baseChrNeedsStub = new Set<string>();

    for (const ch of chunks) {
      if (othersMode && ch.isOthers) {
        baseChrNeedsStub.add(ch.chrBase);
      } else {
        realChrs.add(ch.chrQuery);
      }
    }

    // Build slot specs in order:
    // [others-left for each base-chr-with-stubs] [real query chrs in appearance order] [others-right]
    // Actually: per the user's example — others, 1A, others — we want:
    //   one "others" block on the left, then real chrs, then one "others" block on the right.
    // Each "others" stub is a single combined block (not per base-chr), side = left or right.

    type SlotSpec =
      | { kind: "chr"; chr: string; bpLen: number; colorIdx: number }
      | { kind: "others"; baseChr: string; side: "left" | "right" };

    const chrSpecs: SlotSpec[] = [];
    // Real query chrs in first-appearance order
    const seenQuery = new Set<string>();
    for (const r of data) {
      if (r.chromosomeQuery && realChrs.has(r.chromosomeQuery) && !seenQuery.has(r.chromosomeQuery)) {
        seenQuery.add(r.chromosomeQuery);
        chrSpecs.push({
          kind: "chr",
          chr: r.chromosomeQuery,
          bpLen: Math.max(queryChrMax.get(r.chromosomeQuery) ?? 1, 1),
          colorIdx: queryChrColorIdx.get(r.chromosomeQuery) ?? 0,
        });
      }
    }

    const specs: SlotSpec[] = [];

    if (othersMode && baseChrNeedsStub.size > 0) {
      // Single combined others stub on the left
      // Use first baseChr that needs a stub as representative (for routing, we'll match by side)
      specs.push({ kind: "others", baseChr: "__others__", side: "left" });
    }
    specs.push(...chrSpecs);
    if (othersMode && baseChrNeedsStub.size > 0) {
      specs.push({ kind: "others", baseChr: "__others__", side: "right" });
    }

    return buildQueryRow(specs, queryLabel, PAD.top + BARH + ROWGAP, trackW);
  }, [chunks, data, queryChrMax, queryChrColorIdx, queryLabel, trackW, othersMode]);

  // ── 5. Ribbon geometry — computed from final query row layout ───────────
  interface ChunkRibbon {
    chunk: Chunk;
    bxs: number;
    bxe: number;
    qxs: number;
    qxe: number;
  }

  const ribbons = useMemo<ChunkRibbon[]>(() => {
    const out: ChunkRibbon[] = [];

    for (const chunk of chunks) {
      const bBar = baseRow.bars.find((b) => b.chr === chunk.chrBase);
      if (!bBar) continue;

      const bxs = bpToPx(bBar, chunk.bp1Base);
      const bxe = bpToPx(bBar, chunk.bp2Base);

      if (othersMode && chunk.isOthers) {
        // Route to the left or right others stub.
        // Side: if the chunk midpoint is in the left half of its source bar → left stub,
        //       otherwise → right stub.
        const chunkMid = (bxs + bxe) / 2;
        const barMid = bBar.px + bBar.pw / 2;
        const side: "left" | "right" = chunkMid <= barMid ? "left" : "right";

        const stub = queryRow.slots.find((s) => s.kind === "others" && (s as OthersBar).side === side) as
          | OthersBar
          | undefined;
        if (!stub) continue;

        const halfW = Math.min((bxe - bxs) / 2, OTHERSW / 2);
        out.push({
          chunk: chunk,
          bxs,
          bxe,
          qxs: stub.targetX - halfW,
          qxe: stub.targetX + halfW,
        });
        continue;
      }

      // Route to real query chr bar
      const qSlot = queryRow.slots.find((s) => s.kind === "chr" && (s as ChrBar).chr === chunk.chrQuery) as
        | ChrBar
        | undefined;
      if (!qSlot) continue;

      const rx0 = bpToPx(qSlot, chunk.bp1Query);
      const rx1 = bpToPx(qSlot, chunk.bp2Query);
      const qxs = chunk.isInvert ? Math.max(rx0, rx1) : Math.min(rx0, rx1);
      const qxe = chunk.isInvert ? Math.min(rx0, rx1) : Math.max(rx0, rx1);
      out.push({ chunk: chunk, bxs, bxe, qxs, qxe });
    }

    return out;
  }, [chunks, baseRow, queryRow, othersMode]);

  // ── Global counts ───────────────────────────────────────────────────────
  const globalCounts = useMemo(() => {
    const c = zeroCounts();
    chunks.forEach((ch) => {
      (Object.keys(ch.counts) as Array<keyof EventCounts>).forEach((k) => {
        c[k] = (c[k] ?? 0) + ch.counts[k as keyof EventCounts];
      });
    });
    return c;
  }, [chunks]);

  const svgH = PAD.top + BARH + ROWGAP + BARH + PAD.bottom;
  const y1bot = baseRow.y + BARH + RIBBONGAP;
  const y2top = queryRow.y - RIBBONGAP;

  const onMove = useCallback((e: MouseEvent<SVGPathElement>, ch: Chunk) => {
    setTooltip({ cx: e.clientX, cy: e.clientY, chunk: ch });
    setHoverChunk(ch.id);
  }, []);
  const onLeave = useCallback(() => {
    setTooltip(null);
    setHoverChunk(null);
  }, []);

  if (!data.length) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>⬡</span>
        <span className={styles.emptyTitle}>No data to visualize</span>
        <span className={styles.emptySub}>Run an analysis first</span>
      </div>
    );
  }

  const othersCount = chunks.filter((c) => c.isOthers).length;

  return (
    <div className={styles.container}>
      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Gap (bp)</span>
          <input
            className={styles.controlInput}
            type="number"
            min={0}
            step={10000}
            value={gapBp}
            onChange={(e) => setGapBp(Math.max(10000, parseInt(e.target.value) || 10000))}
            style={{ width: 90 }}
          />
        </div>

        <div className={styles.sep} />

        <button
          className={`${styles.toggleBtn} ${othersMode ? styles.toggleBtnOn : ""}`}
          onClick={() => setOthersMode((v) => !v)}
          type="button"
        >
          <span className={styles.toggleDot} />
          Group others
          {othersCount > 0 && <span className={styles.toggleBadge}>{othersCount}</span>}
        </button>

        <div className={styles.sep} />

        <div className={styles.statsStrip}>
          <div className={styles.statItem}>
            <span className={styles.statNum}>{chunks.length}</span>
            <span>chunks</span>
          </div>
          {(["synteny", "inversion", "translocation", "translocation+inversion"] as ChunkEvent[]).map((ev) => (
            <div className={styles.statItem} key={ev}>
              <span className={styles.statNum} style={{ color: CHUNKCOLOR[ev] }}>
                {globalCounts[ev]}
              </span>
              <span>{ev === "translocation+inversion" ? "t+inv" : ev.slice(0, 5)}</span>
            </div>
          ))}
        </div>

        <div className={styles.legend}>
          {(["synteny", "inversion", "translocation", "translocation+inversion"] as ChunkEvent[]).map((ev) => (
            <div className={styles.legendItem} key={ev}>
              <div className={styles.legendSwatch} style={{ background: CHUNKCOLOR[ev] }} />
              {ev === "translocation+inversion" ? "trans+inv" : ev}
            </div>
          ))}
          {othersMode && (
            <div className={styles.legendItem}>
              <div className={styles.legendSwatch} style={{ background: OTHERSCOL }} />
              others
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className={styles.canvasWrap} ref={wrapRef}>
        <svg className={styles.svgCanvas} width={svgW} height={svgH} onMouseLeave={onLeave}>
          <rect width={svgW} height={svgH} fill="white" />

          <Group left={PAD.left}>
            {/* Ribbons — drawn first so bars sit on top */}
            <g>
              {ribbons.map(({ chunk: ch, bxs, bxe, qxs, qxe }) => {
                const hot = hoverChunk === ch.id;
                const dimmed = hoverChunk !== null && !hot;
                const color = CHUNKCOLOR[ch.dominant];
                const baseOp = CHUNKOPACITY[ch.dominant];
                const op = dimmed ? baseOp * 0.15 : baseOp;

                return (
                  <path
                    key={ch.id}
                    d={ribbonPath(bxs, bxe, y1bot, qxs, qxe, y2top)}
                    fill={color}
                    fillOpacity={op}
                    stroke={hot ? color : "none"}
                    strokeWidth={hot ? 1 : 0}
                    style={{ cursor: "pointer" }}
                    onMouseMove={(e) => onMove(e, ch)}
                  />
                );
              })}
            </g>

            {/* Base genome row */}
            <g>
              <text
                x={-10}
                y={baseRow.y + BARH / 2 + 4}
                textAnchor="end"
                fontSize={11}
                fontFamily={FONT}
                fill="#64748b"
              >
                {baseRow.label}
              </text>
              {baseRow.bars.map((bar) => {
                const col = CHRPALETTE[bar.colorIdx];
                return (
                  <g key={bar.chr}>
                    <rect
                      x={bar.px}
                      y={baseRow.y}
                      width={Math.max(bar.pw, 1)}
                      height={BARH}
                      fill={col}
                      fillOpacity={0.12}
                      stroke={col}
                      strokeWidth={1.2}
                      strokeOpacity={0.55}
                      rx={2}
                    />
                    {bar.pw > 24 && (
                      <text
                        x={bar.px + bar.pw / 2}
                        y={baseRow.y - 7}
                        textAnchor="middle"
                        fontSize={9}
                        fontFamily={FONT}
                        fill={col}
                        fillOpacity={0.8}
                      >
                        {bar.chr}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Query genome row */}
            <g>
              <text
                x={-10}
                y={queryRow.y + BARH / 2 + 4}
                textAnchor="end"
                fontSize={11}
                fontFamily={FONT}
                fill="#64748b"
              >
                {queryRow.label}
              </text>

              {queryRow.slots.map((slot, si) => {
                if (slot.kind === "chr") {
                  const col = CHRPALETTE[slot.colorIdx];
                  return (
                    <g key={slot.chr}>
                      <rect
                        x={slot.px}
                        y={queryRow.y}
                        width={Math.max(slot.pw, 1)}
                        height={BARH}
                        fill={col}
                        fillOpacity={0.12}
                        stroke={col}
                        strokeWidth={1.2}
                        strokeOpacity={0.55}
                        rx={2}
                      />
                      {slot.pw > 24 && (
                        <text
                          x={slot.px + slot.pw / 2}
                          y={queryRow.y + BARH + 14}
                          textAnchor="middle"
                          fontSize={9}
                          fontFamily={FONT}
                          fill={col}
                          fillOpacity={0.8}
                        >
                          {slot.chr}
                        </text>
                      )}
                    </g>
                  );
                }
                // OthersBar
                return (
                  <g key={`others-${slot.side}-${si}`}>
                    <rect
                      x={slot.px}
                      y={queryRow.y}
                      width={slot.pw}
                      height={BARH}
                      fill={OTHERSCOL}
                      fillOpacity={0.1}
                      stroke={OTHERSCOL}
                      strokeWidth={1}
                      strokeOpacity={0.4}
                      strokeDasharray="3 2"
                      rx={2}
                    />
                    <text
                      x={slot.px + slot.pw / 2}
                      y={queryRow.y + BARH + 14}
                      textAnchor="middle"
                      fontSize={8}
                      fontFamily={FONT}
                      fill={OTHERSCOL}
                      fillOpacity={0.8}
                    >
                      others
                    </text>
                  </g>
                );
              })}
            </g>
          </Group>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className={styles.tooltip}
            style={{
              left: Math.min(tooltip.cx + 16, window.innerWidth - 290),
              top: tooltip.cy - 10,
            }}
          >
            <TooltipContent chunk={tooltip.chunk} />
          </div>
        )}
      </div>
    </div>
  );
}
