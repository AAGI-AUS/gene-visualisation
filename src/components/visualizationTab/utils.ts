import type { QuerySlotLookup, ResultRow } from "@/types";
import {
  CHR_GAP_PX,
  CHR_PALETTE,
  CHROM_THICKNESS,
  ChunkEvent,
  chunkEvents,
  OTHERS_W,
  PAD,
  ROW_GAP,
} from "@/src/constants";
import type { BaseRow, Chunk, ChunkRibbon, ChrBar, EventCounts, QueryRow, QuerySlot } from "@/types";
import { withinThreshold } from "@/src/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Event classification
// ─────────────────────────────────────────────────────────────────────────────

export function rowCategory(r: ResultRow): ChunkEvent {
  if (!r.isTranslocation) {
    if (!r.isInvert) return "synteny";
    return "inversion";
  }
  if (!r.isInvert) return "translocation";
  return "translocation+inversion";
}

export function zeroCounts(): EventCounts {
  return { synteny: 0, inversion: 0, translocation: 0, "translocation+inversion": 0, total: 0 };
}

export function dominantEvent(c: EventCounts): ChunkEvent {
  return chunkEvents.reduce((b, k) => (c[k] > c[b] ? k : b), chunkEvents[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunk building
// ─────────────────────────────────────────────────────────────────────────────

export function buildChunk(rows: ResultRow[], idx: number): Chunk {
  const chrBase = rows[0].chromosomeBase;
  const bp1Base = rows[0].p1Base;
  const bp2Base = rows[rows.length - 1].p2Base;

  const eventCounts = zeroCounts();
  for (const r of rows) {
    eventCounts[rowCategory(r)]++;
    eventCounts.total++;
  }
  const dominant = dominantEvent(eventCounts);

  let bpGeneBase = 0;
  let bpGeneQuery = 0;
  const queryChromCounts: Record<string, number> = {};
  for (const r of rows) {
    bpGeneBase += r.p2Base - r.p1Base;
    if (r.chromosomeQuery) {
      bpGeneQuery += r.p2Query - r.p1Query;
      queryChromCounts[r.chromosomeQuery] = (queryChromCounts[r.chromosomeQuery] ?? 0) + 1;
    }
  }
  const chrQuery = Object.entries(queryChromCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  const qRows = rows.filter((r) => r.chromosomeQuery === chrQuery);
  const bp1Query = qRows.length ? Math.min(...qRows.map((r) => r.p1Query)) : 0;
  const bp2Query = qRows.length ? Math.max(...qRows.map((r) => r.p2Query)) : 0;
  const isInvert = qRows.filter((r) => r.isInvert).length > qRows.length / 2;
  const isOthers = rows.filter((r) => r.groupedQuery === "others").length > rows.length / 2;

  return {
    id: `${chrBase}-${idx}`,
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
}

/**
 * Split sorted rows for one chromosome into chunks.
 * Non-translocations and translocations are chunked separately so they're
 * never merged together, then both sets are returned.
 */
export function chunkRows(rows: ResultRow[], gapBp: number): Chunk[] {
  if (!rows.length) return [];
  const out: Chunk[] = [];

  const nonTrans = rows.filter((r) => !r.isTranslocation);
  const trans = rows.filter((r) => r.isTranslocation);
  const transMinor = trans.filter((r) => r.groupedQuery === "others");
  const transMajor = trans.filter((r) => r.groupedQuery !== "others");

  // group stuff together
  function sweep(group: ResultRow[], strict: boolean) {
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
        const firstQ = first.isInvert ? first.p2Query : first.p1Query;
        const curQ = cur.isInvert ? cur.p1Query : cur.p2Query;
        const projBase = cur.p2Base - first.p1Base;
        const projQuery = Math.abs(curQ - firstQ);
        ok = withinThreshold(projQuery, projBase);
      }

      if (ok) {
        acc.push(cur);
      } else {
        out.push(buildChunk(acc, out.length));
        acc = [cur];
      }
    }
    out.push(buildChunk(acc, out.length));
  }

  sweep(nonTrans, true);
  sweep(transMajor, true);
  sweep(transMinor, false);

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row layout builders
// ─────────────────────────────────────────────────────────────────────────────

export function buildBaseRow(
  chrMaxBp: Map<string, number>,
  chrMinBp: Map<string, number>,
  chrOrder: string[],
  label: string,
  availW: number,
  othersMode: boolean
): BaseRow {
  const n = chrOrder.length;
  if (n === 0) return { label, bars: [], y: PAD.top };

  const totalBp = chrOrder.reduce((s, c) => s + (chrMaxBp.get(c) ?? 1), 0);
  const gapBudget = (n - 1) * CHR_GAP_PX;

  let cursor = othersMode ? OTHERS_W + CHR_GAP_PX : 0;
  const pxPerBp = Math.max(availW - gapBudget - 2 * cursor, n) / Math.max(totalBp, 1);
  const bars: ChrBar[] = chrOrder.map((chr, i) => {
    const p1 = chrMinBp.get(chr) ?? 0;
    const bpLen = Math.max(chrMaxBp.get(chr) ?? 1, 1) - p1;
    const pw = bpLen * pxPerBp;
    const bar: ChrBar = { kind: "chr", chr, px: cursor, pw, bpLen, p1, colorIdx: i % CHR_PALETTE.length };
    cursor += pw + (i < n - 1 ? CHR_GAP_PX : 0);
    return bar;
  });

  return { label, bars, y: PAD.top };
}

export type SlotSpec =
  | { kind: "chr"; chr: string; bpLen: number; p1: number; colorIdx: number }
  | { kind: "others"; baseChr: string; side: "left" | "right" };

export function buildQueryRow(slotSpecs: SlotSpec[], label: string, availW: number): QueryRow {
  const y = PAD.top + CHROM_THICKNESS + ROW_GAP;
  const n = slotSpecs.length;
  if (n === 0) return { label, slots: [], y };

  const nOthers = slotSpecs.filter((s) => s.kind === "others").length;
  const totalBpForChr = slotSpecs
    .filter((s) => s.kind === "chr")
    .reduce((sum, s) => sum + (s as { bpLen: number }).bpLen, 0);
  const gapPx = (n - 1) * CHR_GAP_PX;
  const chrBudget = Math.max(
    availW - nOthers * OTHERS_W - gapPx,
    slotSpecs.filter((s) => s.kind === "chr").length * 2
  );
  const pxPerBp = totalBpForChr > 0 ? chrBudget / totalBpForChr : 1;

  let cursor = 0;
  const slots: QuerySlot[] = slotSpecs.map((spec, i) => {
    let slot: QuerySlot;
    if (spec.kind === "chr") {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Ribbon geometry
// ─────────────────────────────────────────────────────────────────────────────

export function bpToPx(bar: ChrBar, bp: number): number {
  const frac = Math.min(Math.max((bp - bar.p1) / bar.bpLen, 0), 1);
  return bar.px + frac * bar.pw;
}

export function ribbonPath(
  baseX1: number,
  baseX2: number,
  y1: number,
  queryX1: number,
  queryX2: number,
  y2: number,
  minWidth = 0
): string {
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
}

export function computeRibbons(
  chunks: Chunk[],
  baseRow: BaseRow,
  queryRow: QueryRow,
  othersMode: boolean
): ChunkRibbon[] {
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

  for (const chunk of chunks) {
    const bBar = baseRow.bars.find((b) => b.chr === chunk.chrBase);
    if (!bBar) continue;

    const bxs = bpToPx(bBar, chunk.bp1Base);
    const bxe = bpToPx(bBar, chunk.bp2Base);

    if (othersMode && chunk.isOthers) {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Misc utilities
// ─────────────────────────────────────────────────────────────────────────────

export function pct(n: number, total: number): string {
  return total ? `${((n / total) * 100).toFixed(1)}%` : "0%";
}

export function exportSvg(svgEl: SVGSVGElement, filename = "synteny.svg"): void {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent =
    "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');";
  defs.appendChild(style);
  clone.insertBefore(defs, clone.firstChild);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
