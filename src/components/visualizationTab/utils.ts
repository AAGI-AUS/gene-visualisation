import type { QuerySlotLookup, ResultRow } from "@/types";
import type { ChunkEvent, OthersMode } from "@/src/constants";
import {
  CHR_GAP_PX,
  CHROM_THICKNESS,
  DEFAULT_TICK_STEP_BP,
  MAX_TICK_OFFSET_FRAC,
  MAX_TICKS_PER_BAR,
  MAX_TICKS_PER_CHR,
  TICK_MULTIPLES,
  OTHERS_W,
  PAD,
  ROW_GAP,
  TICK_TARGET_EM,
  TICK_TARGET_PX,
} from "@/src/constants";
import type { BaseRow, Chunk, ChunkRibbon, ChrBar, EventCounts, QueryRow, QuerySlot, Tick } from "@/types";
import { clamp, closeTo } from "@/src/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Event classification
// ─────────────────────────────────────────────────────────────────────────────

export const rowCategory = (r: ResultRow): ChunkEvent => {
  if (!r.isTranslocation) {
    if (!r.isInvert) return "synteny";
    return "inversion";
  }
  if (!r.isInvert) return "translocation";
  return "translocation+inversion";
};

export const zeroCounts = (): EventCounts => {
  return { synteny: 0, inversion: 0, translocation: 0, "translocation+inversion": 0, total: 0 };
};

// ─────────────────────────────────────────────────────────────────────────────
// Noisy gene-id detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A gene id is noisy if it's absent from chunks in at least one pair.
 * Equivalent: keep only ids present in every pair's chunk set.
 */
export const collectNoisyIds = (chunksPerPair: Chunk[][]): Set<number> => {
  if (chunksPerPair.length <= 1) return new Set();

  const keptPerPair = chunksPerPair.map((chunks) => {
    const s = new Set<number>();
    for (const c of chunks) for (const id of c.ids) s.add(id);
    return s;
  });

  const allIds = new Set<number>();
  for (const s of keptPerPair) for (const id of s) allIds.add(id);

  const noisy = new Set<number>();
  for (const id of allIds) {
    for (const s of keptPerPair) {
      if (!s.has(id)) {
        noisy.add(id);
        break;
      }
    }
  }
  return noisy;
};

// ─────────────────────────────────────────────────────────────────────────────
// Chunk building
// ─────────────────────────────────────────────────────────────────────────────

export const buildChunk = (rows: ResultRow[], idx: number, lineName: string): Chunk => {
  const chrBase = rows[0].chromosomeBase;
  const bp1Base = rows[0].p1Base;
  const bp2Base = rows[rows.length - 1].p2Base;

  const eventCounts = zeroCounts();
  let bpGeneBase = 0;
  let bpGeneQuery = 0;
  const queryChromCounts: Record<string, number> = {};
  const ids: number[] = [];
  let chrQuery = "";
  let chrQueryMaxCount = 0;
  let othersCount = 0;
  let dominant: ChunkEvent = "synteny";
  let dominantCount = 0;
  for (const r of rows) {
    ids.push(r.id);
    const cat = rowCategory(r);
    const next = eventCounts[cat] + 1;
    eventCounts[cat] = next;
    eventCounts.total++;
    if (next > dominantCount) {
      dominantCount = next;
      dominant = cat;
    }
    bpGeneBase += r.p2Base - r.p1Base;
    if (r.chromosomeQuery) {
      bpGeneQuery += r.p2Query - r.p1Query;
      const nextChr = (queryChromCounts[r.chromosomeQuery] ?? 0) + 1;
      queryChromCounts[r.chromosomeQuery] = nextChr;
      if (nextChr > chrQueryMaxCount) {
        chrQueryMaxCount = nextChr;
        chrQuery = r.chromosomeQuery;
      }
    }
    if (r.groupedQuery === "others") othersCount++;
  }

  // HACK: some info lost, but not matter vis wise
  const onlySynteny = dominant === "synteny";
  let bp1Query = Infinity;
  let bp2Query = -Infinity;
  let qRowsCount = 0;
  let invertCount = 0;
  for (const r of rows) {
    if (r.chromosomeQuery !== chrQuery) continue;
    qRowsCount++;
    if (r.isInvert) invertCount++;
    if (onlySynteny && r.mainEvent !== "synteny") continue;
    if (r.p1Query < bp1Query) bp1Query = r.p1Query;
    if (r.p2Query > bp2Query) bp2Query = r.p2Query;
  }
  if (qRowsCount === 0) {
    bp1Query = 0;
    bp2Query = 0;
  }
  const isInvert = invertCount > qRowsCount / 2;
  const isOthers = othersCount > rows.length / 2;

  return {
    id: `${lineName}-${chrBase}-${idx}`,
    ids,
    chrBase,
    bp1Base,
    bp2Base,
    bpGeneBase,
    chrQuery,
    bp1Query,
    bp2Query,
    bpGeneQuery,
    dominant,
    eventCounts,
    queryChromCounts,
    isInvert,
    isOthers,
  };
};

/**
 * Split sorted rows for one chromosome into chunks.
 * Non-translocations and translocations are chunked separately so they're
 * never merged together, then both sets are returned.
 */
export const chunkRows = (rows: ResultRow[], gapBp: number, lineName: string): Chunk[] => {
  if (!rows.length) return [];
  const out: Chunk[] = [];

  const nonTrans: ResultRow[] = [];
  const transMajor: ResultRow[] = [];
  const transMinor: ResultRow[] = [];
  for (const r of rows) {
    if (!r.isTranslocation) nonTrans.push(r);
    else if (r.groupedQuery === "others") transMinor.push(r);
    else transMajor.push(r);
  }

  // group stuff together
  const sweep = (group: ResultRow[], strict: boolean) => {
    if (!group.length) return;
    let acc = [group[0]];
    for (let i = 1; i < group.length; i++) {
      const first = acc[0];
      const prev = acc[acc.length - 1];
      const cur = group[i];
      const gap = cur.p1Base - prev.p2Base;

      let ok = gap <= gapBp;
      if (ok && strict) {
        // Additional check: query span must stay proportional to base span
        const baseLen = cur.p2Base - first.p1Base;
        const queryLen = Math.max(Math.abs(cur.p2Query - first.p1Query), Math.abs(cur.p1Query - first.p2Query));
        ok = closeTo(queryLen, baseLen);
        if (!cur.isInvert && cur.p2Query < first.p1Query) ok = false;
      }

      if (ok) {
        acc.push(cur);
      } else {
        out.push(buildChunk(acc, out.length, lineName));
        acc = [cur];
      }
    }
    out.push(buildChunk(acc, out.length, lineName));
  };

  sweep(nonTrans, true);
  sweep(transMajor, true);
  sweep(transMinor, false);
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Row layout builders
// ─────────────────────────────────────────────────────────────────────────────

export const buildBaseRow = (
  chrMaxBp: Map<string, number>,
  chrMinBp: Map<string, number>,
  chrOrder: string[],
  label: string,
  availW: number,
  othersMode: OthersMode,
  sharedPxPerBp?: number
): BaseRow => {
  const n = chrOrder.length;
  if (n === 0) return { label, bars: [], y: PAD.top };

  const totalBp = chrOrder.reduce(
    (total, chr) => total + ((chrMaxBp.get(chr) ?? 1) - (chrMinBp.get(chr) ?? 0)),
    0
  );
  const gapBudget = (n - 1) * CHR_GAP_PX;

  const startCursor = othersMode === "group" ? OTHERS_W + CHR_GAP_PX : 0;
  const rowPxPerBp = Math.max(availW - gapBudget - 2 * startCursor, n) / Math.max(totalBp, 1);

  let cursor = startCursor;
  const bars: ChrBar[] = chrOrder.map((chr, i) => {
    const p1 = chrMinBp.get(chr) ?? 0;
    const bpLen = Math.max(chrMaxBp.get(chr) ?? 1, 1) - p1;
    const pxPerBp = sharedPxPerBp ?? rowPxPerBp;
    const pw = bpLen * pxPerBp;

    const bar: ChrBar = { kind: "chr", chr, px: cursor, pw, bpLen, p1 };
    cursor += pw + (i < n - 1 ? CHR_GAP_PX : 0);
    return bar;
  });

  return { label, bars, y: PAD.top };
};

export type SlotSpec =
  | { kind: "chr"; chr: string; bpLen: number; p1: number }
  | { kind: "others"; baseChr: string; side: "left" | "right" };

export const buildQueryRow = (
  slotSpecs: SlotSpec[],
  label: string,
  availW: number,
  sharedPxPerBp?: number
): QueryRow => {
  const y = PAD.top + CHROM_THICKNESS + ROW_GAP;
  const n = slotSpecs.length;
  if (n === 0) return { label, slots: [], y };

  let nOthers = 0;
  let nChrs = 0;
  let totalBpForChr = 0;
  for (const s of slotSpecs) {
    if (s.kind === "chr") {
      nChrs++;
      totalBpForChr += s.bpLen;
    } else {
      nOthers++;
    }
  }
  const gapPx = (n - 1) * CHR_GAP_PX;
  const chrBudget = Math.max(availW - nOthers * OTHERS_W - gapPx, nChrs * 2);
  const rowPxPerBp = totalBpForChr > 0 ? chrBudget / totalBpForChr : 1;

  let cursor = 0;
  const slots: QuerySlot[] = slotSpecs.map((spec, i) => {
    let slot: QuerySlot;
    if (spec.kind === "chr") {
      const pxPerBp = sharedPxPerBp ?? rowPxPerBp;
      const pw = spec.bpLen * pxPerBp;
      slot = { ...spec, px: cursor, pw };
      cursor += pw;
    } else {
      slot = {
        kind: "others",
        baseChr: spec.baseChr,
        side: spec.side,
        px: cursor,
        pw: OTHERS_W,
        targetX: cursor + OTHERS_W / 2,
      };
      cursor += OTHERS_W;
    }
    if (i < n - 1) cursor += CHR_GAP_PX;
    return slot;
  });

  return { label, slots, y };
};

// ─────────────────────────────────────────────────────────────────────────────
// Axis ticks
// ─────────────────────────────────────────────────────────────────────────────

export const niceTickStep = (rawBp: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(rawBp));
  const normalized = rawBp / magnitude;
  const multiple = TICK_MULTIPLES.find((m) => normalized <= m) ?? 10;
  return multiple * magnitude;
};

export const resolveTickStepBp = (bars: ChrBar[], fontSize: number, manualMbp: number): number => {
  if (manualMbp > 0) return manualMbp * 1e6;

  let pxPerBp = Infinity;
  let widestBpLen = 0;
  for (const bar of bars) {
    if (bar.pw <= 0 || bar.bpLen <= 0) continue;
    const ratio = bar.pw / bar.bpLen;
    if (ratio < pxPerBp) pxPerBp = ratio;
    if (bar.bpLen > widestBpLen) widestBpLen = bar.bpLen;
  }
  if (!isFinite(pxPerBp)) return DEFAULT_TICK_STEP_BP;

  const bySpacing = Math.max(TICK_TARGET_PX, TICK_TARGET_EM * fontSize) / pxPerBp;
  const byCount = widestBpLen / MAX_TICKS_PER_CHR;
  return niceTickStep(Math.max(bySpacing, byCount));
};

const BP_UNITS = [
  { div: 1e9, suffix: "G" },
  { div: 1e6, suffix: "M" },
  { div: 1e3, suffix: "k" },
];

export const formatBpLabel = (bp: number): string => {
  const unit = BP_UNITS.find((u) => Math.abs(bp) >= u.div);
  if (!unit) return `${Math.round(bp)}`;
  const scaled = (bp / unit.div).toFixed(3);
  return `${scaled.replace(/\.?0+$/, "")}${unit.suffix}`;
};

const inRange = (bar: ChrBar, bp: number) => bp >= bar.p1 && bp <= bar.p1 + bar.bpLen;

const barTicks = (bar: ChrBar, stepBp: number): { bp: number; x: number }[] => {
  const startBp = Math.ceil(bar.p1 / stepBp) * stepBp;
  const count = Math.min(Math.floor((bar.p1 + bar.bpLen - startBp) / stepBp) + 1, MAX_TICKS_PER_BAR);
  return Array.from({ length: Math.max(count, 0) }, (_, i) => {
    const bp = startBp + i * stepBp;
    return { bp, x: bpToPx(bar, bp) };
  });
};

// Ticks come from each bar's own extent, then pair up by chr + bp
// a bp on both sides can carry a connector, one on a single side carries a mark and a label
export const collectTicks = (
  baseBars: ChrBar[],
  queryBars: ChrBar[],
  stepBp: number,
  connect: boolean
): Tick[] => {
  const queryByChr = new Map(queryBars.map((b) => [b.chr, b]));
  const out: Tick[] = [];

  for (const baseBar of baseBars) {
    const queryBar = queryByChr.get(baseBar.chr);
    for (const { bp, x } of barTicks(baseBar, stepBp)) {
      const pairedBar = queryBar && inRange(queryBar, bp) ? queryBar : undefined;
      const xBottom = pairedBar ? bpToPx(pairedBar, bp) : undefined;
      const pw = pairedBar ? Math.min(baseBar.pw, pairedBar.pw) : baseBar.pw;
      const drawLine =
        connect && xBottom !== undefined && (pw <= 0 || Math.abs(x - xBottom) / pw <= MAX_TICK_OFFSET_FRAC);
      out.push({ xTop: x, xBottom, label: formatBpLabel(bp), key: `${baseBar.chr}-${bp}`, drawLine, pw });
    }
  }

  const emitted = new Set(out.map((t) => t.key));

  for (const queryBar of queryBars) {
    for (const { bp, x } of barTicks(queryBar, stepBp)) {
      const key = `${queryBar.chr}-${bp}`;
      if (emitted.has(key)) continue;
      out.push({ xBottom: x, label: formatBpLabel(bp), key, drawLine: false, pw: queryBar.pw });
    }
  }

  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Ribbon geometry
// ─────────────────────────────────────────────────────────────────────────────

export const bpToPx = (bar: ChrBar, bp: number): number => {
  const frac = clamp((bp - bar.p1) / bar.bpLen, 0, 1);
  return bar.px + frac * bar.pw;
};

export const ribbonPath = (
  baseX1: number,
  baseX2: number,
  y1: number,
  queryX1: number,
  queryX2: number,
  y2: number,
  minWidth = 0
) => {
  if (Math.abs(baseX2 - baseX1) < minWidth) {
    const cx = (baseX1 + baseX2) / 2;
    baseX1 = cx - minWidth / 2;
    baseX2 = cx + minWidth / 2;
  }
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
};

export const computeRibbons = (
  chunks: Chunk[],
  baseRow: BaseRow,
  queryRow: QueryRow,
  othersMode: OthersMode
): ChunkRibbon[] => {
  const out: ChunkRibbon[] = [];
  const querySlotLookup = queryRow.slots.reduce(
    (acc, s) => {
      if (s.kind === "chr") acc.chromosome[s.chr] = s;
      else if (s.side === "left") acc.others.left = s;
      else acc.others.right = s;
      return acc;
    },
    { others: {}, chromosome: {} } as QuerySlotLookup
  );
  const baseBarLookup = new Map<string, ChrBar>();
  for (const b of baseRow.bars) baseBarLookup.set(b.chr, b);

  for (const chunk of chunks) {
    const bBar = baseBarLookup.get(chunk.chrBase);
    if (!bBar) continue;

    const bxs = bpToPx(bBar, chunk.bp1Base);
    const bxe = bpToPx(bBar, chunk.bp2Base);

    if (othersMode === "group" && chunk.isOthers) {
      const chunkMid = (bxs + bxe) / 2;
      const barMid = bBar.px + bBar.pw / 2;
      const side: "left" | "right" = chunkMid <= barMid ? "left" : "right";
      const stub = querySlotLookup.others[side];
      if (!stub) continue;

      const halfW = Math.min((bxe - bxs) / 2, OTHERS_W / 2);
      out.push({ chunk, bxs, bxe, qxs: stub.targetX - halfW, qxe: stub.targetX + halfW });
      continue;
    }

    const qSlot = querySlotLookup.chromosome[chunk.chrQuery];
    if (!qSlot) continue;

    const rx0 = bpToPx(qSlot, chunk.bp1Query);
    const rx1 = bpToPx(qSlot, chunk.bp2Query);

    let qxs: number;
    let qxe: number;
    if (chunk.isInvert) {
      qxs = rx1;
      qxe = rx0;
    } else {
      qxs = rx0;
      qxe = rx1;
    }
    out.push({ chunk, bxs, bxe, qxs, qxe });
  }

  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Misc utilities
// ─────────────────────────────────────────────────────────────────────────────

export const pct = (n: number, total: number): string => {
  return total ? `${((n / total) * 100).toFixed(1)}%` : "0%";
};

export const serializeSvg = (svgEl: SVGSVGElement): Blob => {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent =
    "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');";
  defs.appendChild(style);
  clone.insertBefore(defs, clone.firstChild);
  return new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8",
  });
};

export const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const svgToPngBlob = async (svgEl: SVGSVGElement, scale = 2): Promise<Blob | null> => {
  const w = svgEl.width.baseVal.value || svgEl.clientWidth;
  const h = svgEl.height.baseVal.value || svgEl.clientHeight;
  const svgUrl = URL.createObjectURL(serializeSvg(svgEl));
  try {
    const img = new Image();
    img.src = svgUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};

export const exportSvg = (svgEl: SVGSVGElement, filename = "synteny.svg"): void => {
  triggerDownload(serializeSvg(svgEl), filename);
};

export const exportPng = async (svgEl: SVGSVGElement, filename = "synteny.png", scale = 2): Promise<void> => {
  const blob = await svgToPngBlob(svgEl, scale);
  if (blob) triggerDownload(blob, filename);
};

const BASE_PREDICTING_LINES = ["paragon", "spelt"] as const;

// Extra lines added on top of BASE_PREDICTING_LINES for specific chrs.
const CHR_EXTRA_LINES: Record<string, readonly string[]> = {
  "1A": ["cs"],
  "1D": ["cs"],
  "2A": ["cs"],
  "2D": ["cs"],
  "3A": ["cs"],
  "3B": ["cs", "arina"],
  "4A": ["cs"],
  "4B": ["norin61", "landmark"],
  "4D": ["cs"],
  "5A": ["landmark", "lancer"],
  "5B": ["arina"],
  "6B": ["landmark", "lancer"],
  "6D": ["cs"],
  "7A": ["cs"],
  "7B": ["arina"],
};

export const getPredictingLines = (chr: string): readonly string[] => [
  ...BASE_PREDICTING_LINES,
  ...(CHR_EXTRA_LINES[chr] ?? []),
];

const PREDICT_HALF_WINDOW_MBP = 30;

// Per-chr default centromere midpoint (Mbp); unlisted chrs fall back to 300.
const CHR_DEFAULT_MID: Record<string, number> = {
  "1A": 210,
  "1B": 250,
  "1D": 170,
  "2A": 350,
  "2B": 350,
  "2D": 270,
  "3A": 320,
  "3B": 370,
  "3D": 250,
  "4A": 300,
  "4B": 300,
  "4D": 210,
  "5A": 250,
  "5B": 210,
  "5D": 190,
  "6A": 300,
  "6B": 320,
  "6D": 210,
  "7A": 370,
  "7B": 310,
  "7D": 350,
};

// Per-(chr, line) overrides. A number shifts the mid (still ±half-window);
// an object replaces the whole {lo, hi} window verbatim.
const PREDICTING_OVERRIDES: Record<string, Record<string, number | { lo: number; hi: number }>> = {
  "2B": { paragon: { lo: 355, hi: 365 } },
  "2D": { spelt: 260 },
  "4A": { cs: 250 },
  "4B": { norin61: { lo: 305, hi: 335 }, landmark: { lo: 255, hi: 285 }, spelt: 270 },
  "4D": { spelt: { lo: 200, hi: 205 } },
  "5B": { arina: { lo: 165, hi: 175 } },
  "6A": { paragon: { lo: 289, hi: 293 }, spelt: { lo: 256, hi: 259 } },
  "6D": { paragon: 245 },
  "7B": { arina: 490 },
};

export const getPredictingRange = (chr: string, label: string) => {
  const override = PREDICTING_OVERRIDES[chr]?.[label];
  if (typeof override === "object") return override;

  const mid = override ?? CHR_DEFAULT_MID[chr] ?? 300;
  return { lo: mid - PREDICT_HALF_WINDOW_MBP, hi: mid + PREDICT_HALF_WINDOW_MBP };
};

/**
 * Midpoint of the largest uncovered span inside `[lo, hi]`, given a set of
 * `[bp1, bp2]` intervals. Intervals are clipped to the range and merged,
 * then leading/trailing gaps against the boundaries are considered too.
 * Returns `null` when the range is fully covered or invalid.
 */
export const findLargestGapCenter = (
  intervals: readonly (readonly [number, number])[],
  lo: number,
  hi: number
) => {
  if (hi <= lo) return null;

  const clipped: [number, number][] = [];
  for (const [a, b] of intervals) {
    const left = Math.max(a, lo);
    const right = Math.min(b, hi);
    if (left < right) clipped.push([left, right]);
  }
  clipped.sort((x, y) => x[0] - y[0]);

  const merged: [number, number][] = [];
  for (const [a, b] of clipped) {
    const top = merged[merged.length - 1];
    if (top && a <= top[1]) top[1] = Math.max(top[1], b);
    else merged.push([a, b]);
  }

  let bestGap = 0;
  let bestCenter: number | null = null;
  let prev = lo;
  for (const [a, b] of merged) {
    if (a - prev > bestGap) {
      bestGap = a - prev;
      bestCenter = (prev + a) / 2;
    }
    prev = b;
  }
  if (hi - prev > bestGap) {
    bestGap = hi - prev;
    bestCenter = (prev + hi) / 2;
  }
  return bestCenter;
};
