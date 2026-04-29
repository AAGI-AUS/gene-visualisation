import { useMemo } from "react";
import type { ResultRow } from "@/types";
import { BAR_H, CHR_PALETTE, PAD, RIBBON_GAP, ROW_GAP } from "@/src/constants";
import type { BaseRow, Chunk, ChunkRibbon, EventCounts, QueryRow } from "@/types";
import {
  buildBaseRow,
  buildQueryRow,
  chunkRows,
  computeRibbons,
  SlotSpec,
  zeroCounts,
} from "@/src/components/visualizationTab/utils";

export interface VisualizationLayout {
  baseRow: BaseRow;
  queryRow: QueryRow;
  chunks: Chunk[];
  ribbons: ChunkRibbon[];
  globalCounts: EventCounts;
  othersCount: number;
  svgH: number;
  y1bot: number;
  y2top: number;
}

export function useVisualizationLayout(
  data: ResultRow[],
  baseLabel: string,
  queryLabel: string,
  trackW: number,
  gapBp: number,
  othersMode: boolean,
  hiddenThreshold: number
): VisualizationLayout {
  // 1. Chromosome extents (order of first appearance, max bp)
  const { baseChrMax, baseChrMin, baseChrOrder } = useMemo(() => {
    const baseChrMax = new Map<string, number>();
    const baseChrMin = new Map<string, number>();
    const baseChrOrder: string[] = [];
    const seenBase = new Set<string>();

    for (const r of data) {
      if (r.chromosomeBase && !seenBase.has(r.chromosomeBase)) {
        seenBase.add(r.chromosomeBase);
        baseChrOrder.push(r.chromosomeBase);
      }
      if (r.chromosomeBase) {
        baseChrMax.set(r.chromosomeBase, Math.max(baseChrMax.get(r.chromosomeBase) ?? 0, r.p2Base));
        baseChrMin.set(r.chromosomeBase, Math.min(baseChrMin.get(r.chromosomeBase) ?? 1e21, r.p1Base));
      }
    }
    return { baseChrMax, baseChrMin, baseChrOrder };
  }, [data]);

  // 2. Base row — always shows all base chromosomes
  const baseRow = useMemo(
    () => buildBaseRow(baseChrMax, baseChrMin, baseChrOrder, baseLabel, trackW, othersMode),
    [baseChrMax, baseChrMin, baseChrOrder, baseLabel, trackW, othersMode]
  );

  // 3. Chunks — group rows per base chromosome, split on gap and event boundary
  const chunks = useMemo<Chunk[]>(() => {
    const valid = data.filter((r) => r.chromosomeQuery !== null);
    const byChr = new Map<string, ResultRow[]>();
    for (const r of valid) {
      const arr = byChr.get(r.chromosomeBase) ?? [];
      arr.push(r);
      byChr.set(r.chromosomeBase, arr);
    }
    const all: Chunk[] = [];
    byChr.forEach((rows) =>
      all.push(
        ...chunkRows(
          [...rows].sort((a, b) => a.p1Base - b.p1Base),
          gapBp
        ).filter((c) => c.eventCounts.total > hiddenThreshold)
      )
    );
    return all;
  }, [data, gapBp, hiddenThreshold]);

  const { queryChrMax, queryChrMin, queryChrColorIdx } = useMemo(() => {
    const queryChrMax = new Map<string, number>();
    const queryChrMin = new Map<string, number>();
    const queryChrColorIdx = new Map<string, number>();
    const seenQuery = new Set<string>();
    let qi = 0;

    for (const chunk of chunks) {
      if (othersMode && chunk.isOthers) continue;
      if (!seenQuery.has(chunk.chrQuery)) {
        seenQuery.add(chunk.chrQuery);
        queryChrColorIdx.set(chunk.chrQuery, qi++ % CHR_PALETTE.length);
      }
      queryChrMax.set(chunk.chrQuery, Math.max(queryChrMax.get(chunk.chrQuery) ?? 0, chunk.bp2Query));
      queryChrMin.set(chunk.chrQuery, Math.min(queryChrMin.get(chunk.chrQuery) ?? 1e21, chunk.bp1Query));
    }
    return { queryChrMax, queryChrMin, queryChrColorIdx };
  }, [chunks, othersMode]);

  // 4. Query row — only chrs that receive ribbons; others stubs when in othersMode
  const queryRow = useMemo<QueryRow>(() => {
    const realChrs = new Set<string>();
    const needsStub = new Set<string>();
    for (const ch of chunks) {
      if (othersMode && ch.isOthers) needsStub.add(ch.chrBase);
      else realChrs.add(ch.chrQuery);
    }

    const chrSpecs: SlotSpec[] = [];
    const seen = new Set<string>();
    for (const chromosome of [...realChrs].sort((a, b) => a.localeCompare(b))) {
      if (realChrs.has(chromosome) && !seen.has(chromosome)) {
        seen.add(chromosome);
        const p1 = queryChrMin.get(chromosome) ?? 0;
        chrSpecs.push({
          kind: "chr",
          chr: chromosome,
          p1,
          bpLen: Math.max(queryChrMax.get(chromosome) ?? 1, 1) - p1,
          colorIdx: queryChrColorIdx.get(chromosome) ?? 0,
        });
      }
    }

    const specs: SlotSpec[] = [];
    if (othersMode && needsStub.size > 0) specs.push({ kind: "others", baseChr: "__others__", side: "left" });
    specs.push(...chrSpecs);
    if (othersMode && needsStub.size > 0) specs.push({ kind: "others", baseChr: "__others__", side: "right" });

    return buildQueryRow(specs, queryLabel, trackW);
  }, [chunks, data, queryChrMax, queryChrColorIdx, queryLabel, trackW, othersMode]);

  // 5. Ribbon geometry
  const ribbons = useMemo<ChunkRibbon[]>(
    () => computeRibbons(chunks, baseRow, queryRow, othersMode),
    [chunks, baseRow, queryRow, othersMode]
  );

  console.log(baseRow);
  console.log(queryRow);

  // 6. Aggregate counts
  const globalCounts = useMemo<EventCounts>(() => {
    const c = zeroCounts();
    for (const ch of chunks) {
      (Object.keys(ch.eventCounts) as Array<keyof EventCounts>).forEach((k) => {
        c[k] = (c[k] ?? 0) + ch.eventCounts[k as keyof EventCounts];
      });
    }
    return c;
  }, [chunks]);

  // Extra bottom padding so the tooltip (≈180px) has space below the query bar
  const TOOLTIP_ROOM = 200;
  const svgH = PAD.top + BAR_H + ROW_GAP + BAR_H + PAD.bottom + TOOLTIP_ROOM;
  const y1bot = baseRow.y + BAR_H + RIBBON_GAP;
  const y2top = queryRow.y - RIBBON_GAP;

  return {
    baseRow,
    queryRow,
    chunks,
    ribbons,
    globalCounts,
    othersCount: chunks.filter((c) => c.isOthers).length,
    svgH,
    y1bot,
    y2top,
  };
}
