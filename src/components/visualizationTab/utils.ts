import type { QuerySlotLookup, ResultRow } from "@/types";
import {
  CHR_GAP_PX,
  CHROM_THICKNESS,
  ChunkEvent,
  chunkEvents,
  OTHERS_W,
  OthersMode,
  PAD,
  ROW_GAP,
} from "@/src/constants";
import type { BaseRow, Chunk, ChunkRibbon, ChrBar, EventCounts, QueryRow, QuerySlot } from "@/types";
import { withinThreshold } from "@/src/utils";

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

export const dominantEvent = (c: EventCounts): ChunkEvent => {
  return chunkEvents.reduce((b, k) => (c[k] > c[b] ? k : b), chunkEvents[0]);
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
  for (const r of rows) {
    ids.push(r.id);
    eventCounts[rowCategory(r)]++;
    eventCounts.total++;
    bpGeneBase += r.p2Base - r.p1Base;
    if (r.chromosomeQuery) {
      bpGeneQuery += r.p2Query - r.p1Query;
      const next = (queryChromCounts[r.chromosomeQuery] ?? 0) + 1;
      queryChromCounts[r.chromosomeQuery] = next;
      if (next > chrQueryMaxCount) {
        chrQueryMaxCount = next;
        chrQuery = r.chromosomeQuery;
      }
    }
    if (r.groupedQuery === "others") othersCount++;
  }
  const dominant = dominantEvent(eventCounts);

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
        ok = withinThreshold(queryLen, baseLen);
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
  othersMode: OthersMode
): BaseRow => {
  const n = chrOrder.length;
  if (n === 0) return { label, bars: [], y: PAD.top };

  const totalBp = chrOrder.reduce(
    (total, chr) => total + ((chrMaxBp.get(chr) ?? 1) - (chrMinBp.get(chr) ?? 0)),
    0
  );
  const gapBudget = (n - 1) * CHR_GAP_PX;

  let cursor = othersMode === "group" ? OTHERS_W + CHR_GAP_PX : 0;
  const pxPerBp = Math.max(availW - gapBudget - 2 * cursor, n) / Math.max(totalBp, 1);

  const bars: ChrBar[] = chrOrder.map((chr, i) => {
    const p1 = chrMinBp.get(chr) ?? 0;
    const bpLen = Math.max(chrMaxBp.get(chr) ?? 1, 1) - p1;
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

export const buildQueryRow = (slotSpecs: SlotSpec[], label: string, availW: number): QueryRow => {
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
};

// ─────────────────────────────────────────────────────────────────────────────
// Ribbon geometry
// ─────────────────────────────────────────────────────────────────────────────

export const bpToPx = (bar: ChrBar, bp: number): number => {
  const frac = Math.min(Math.max((bp - bar.p1) / bar.bpLen, 0), 1);
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

const serializeSvg = (svgEl: SVGSVGElement): Blob => {
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

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
};

export const exportSvg = (svgEl: SVGSVGElement, filename = "synteny.svg"): void => {
  triggerDownload(serializeSvg(svgEl), filename);
};

export const exportPng = async (svgEl: SVGSVGElement, filename = "synteny.png", scale = 2): Promise<void> => {
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
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(img, 0, 0);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) triggerDownload(blob, filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};
