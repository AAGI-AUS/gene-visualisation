import type { ResultRow } from "@/types";
import { BAR_H, CHR_GAP_PX, CHR_PALETTE, OTHERS_W, PAD, ROW_GAP } from "@/src/constants";
import type {
  BaseRow,
  Chunk,
  ChunkEvent,
  ChunkRibbon,
  ChrBar,
  EventCounts,
  OthersBar,
  QueryRow,
  QuerySlot,
} from "@/types";
import { withinThreshold } from "@/src/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Event classification
// ─────────────────────────────────────────────────────────────────────────────

export function rowCategory(r: ResultRow): ChunkEvent {
  if (r.isTranslocation && r.isInvert) return "translocation+inversion";
  if (r.isTranslocation) return "translocation";
  if (r.isInvert) return "inversion";
  return "synteny";
}

export function zeroCounts(): EventCounts {
  return { synteny: 0, inversion: 0, translocation: 0, "translocation+inversion": 0, total: 0 };
}

export function dominantEvent(c: EventCounts): ChunkEvent {
  const keys: ChunkEvent[] = ["synteny", "inversion", "translocation", "translocation+inversion"];
  return keys.reduce((b, k) => (c[k] > c[b] ? k : b), keys[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunk building
// ─────────────────────────────────────────────────────────────────────────────

export function buildChunk(rows: ResultRow[], idx: number): Chunk {
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
        const firstQ = first.isInvert ? first.p2Query! : first.p1Query!;
        const curQ = cur.isInvert ? cur.p1Query! : cur.p2Query!;
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
  sweep(trans, false);

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row layout builders
// ─────────────────────────────────────────────────────────────────────────────

export function buildBaseRow(
  chrMaxBp: Map<string, number>,
  chrOrder: string[],
  label: string,
  availW: number
): BaseRow {
  const n = chrOrder.length;
  if (n === 0) return { label, bars: [], y: PAD.top };

  const totalBp = chrOrder.reduce((s, c) => s + (chrMaxBp.get(c) ?? 1), 0);
  const gapBudget = (n - 1) * CHR_GAP_PX;
  const pxPerBp = Math.max(availW - gapBudget, n) / Math.max(totalBp, 1);

  let cursor = 0;
  const bars: ChrBar[] = chrOrder.map((chr, i) => {
    const bpLen = Math.max(chrMaxBp.get(chr) ?? 1, 1);
    const pw = bpLen * pxPerBp;
    const bar: ChrBar = { kind: "chr", chr, px: cursor, pw, bpLen, colorIdx: i % CHR_PALETTE.length };
    cursor += pw + (i < n - 1 ? CHR_GAP_PX : 0);
    return bar;
  });

  return { label, bars, y: PAD.top };
}

type SlotSpec =
  | { kind: "chr"; chr: string; bpLen: number; colorIdx: number }
  | { kind: "others"; baseChr: string; side: "left" | "right" };

export function buildQueryRow(slotSpecs: SlotSpec[], label: string, availW: number): QueryRow {
  const y = PAD.top + BAR_H + ROW_GAP;
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
      slot = { kind: "chr", chr: spec.chr, px: cursor, pw, bpLen: spec.bpLen, colorIdx: spec.colorIdx };
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
  const frac = Math.min(Math.max(bp / bar.bpLen, 0), 1);
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

  for (const chunk of chunks) {
    const bBar = baseRow.bars.find((b) => b.chr === chunk.chrBase);
    if (!bBar) continue;

    const bxs = bpToPx(bBar, chunk.bp1Base);
    const bxe = bpToPx(bBar, chunk.bp2Base);

    if (othersMode && chunk.isOthers) {
      const chunkMid = (bxs + bxe) / 2;
      const barMid = bBar.px + bBar.pw / 2;
      const side: "left" | "right" = chunkMid <= barMid ? "left" : "right";
      const stub = queryRow.slots.find((s) => s.kind === "others" && (s as OthersBar).side === side) as
        | OthersBar
        | undefined;
      if (!stub) continue;
      const halfW = Math.min((bxe - bxs) / 2, OTHERS_W / 2);
      out.push({ chunk, bxs, bxe, qxs: stub.targetX - halfW, qxe: stub.targetX + halfW });
      continue;
    }

    const qSlot = queryRow.slots.find((s) => s.kind === "chr" && (s as ChrBar).chr === chunk.chrQuery) as
      | ChrBar
      | undefined;
    if (!qSlot) continue;

    const rx0 = bpToPx(qSlot, chunk.bp1Query);
    const rx1 = bpToPx(qSlot, chunk.bp2Query);
    const qxs = chunk.isInvert ? Math.max(rx0, rx1) : Math.min(rx0, rx1);
    const qxe = chunk.isInvert ? Math.min(rx0, rx1) : Math.max(rx0, rx1);
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
