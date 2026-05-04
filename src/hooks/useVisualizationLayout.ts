import { useMemo } from "react";
import type { ResultRow } from "@/types";
import { CHROM_THICKNESS, OthersMode, RIBBON_GAP } from "@/src/constants";
import type { BaseRow, Chunk, ChunkRibbon, QueryRow } from "@/types";
import {
  buildBaseRow,
  buildQueryRow,
  chunkRows,
  computeRibbons,
  SlotSpec,
} from "@/src/components/visualizationTab/utils";

export interface VisualizationLayout {
  baseRow: BaseRow;
  queryRow: QueryRow;
  ribbons: ChunkRibbon[];
  y1bot: number;
  y2top: number;
}

export const useVisualizationLayout = (
  data: ResultRow[],
  baseLabel: string,
  queryLabel: string,
  trackW: number,
  gapBp: number,
  othersMode: OthersMode,
  hiddenThreshold: number,
  preBaseRow?: BaseRow
): VisualizationLayout => {
  // Chunks — group rows per base chromosome, split on gap and event boundary
  const chunks = useMemo<Chunk[]>(() => {
    const byChr = new Map<string, ResultRow[]>();
    for (const r of data) {
      const arr = byChr.get(r.chromosomeBase) ?? [];
      arr.push(r);
      byChr.set(r.chromosomeBase, arr);
    }
    const all: Chunk[] = [];
    byChr.forEach((rows) =>
      all.push(
        ...chunkRows(
          rows.sort((a, b) => a.p1Base - b.p1Base),
          gapBp,
          queryLabel
        ).filter((c) => c.eventCounts.total > hiddenThreshold)
      )
    );
    return all;
  }, [data, gapBp, hiddenThreshold, queryLabel]);

  const cleanChunks = useMemo(
    () => (othersMode === "hide" ? chunks.filter((c) => !c.isOthers) : chunks),
    [chunks, othersMode]
  );

  // prepare coords for base and query rows
  const { baseChrMax, baseChrMin, baseChrOrder, queryChrMax, queryChrMin } = useMemo(() => {
    const baseChrMax = new Map<string, number>();
    const baseChrMin = new Map<string, number>();
    const seenBase = new Set<string>();

    const queryChrMax = new Map<string, number>();
    const queryChrMin = new Map<string, number>();

    for (const chunk of cleanChunks) {
      if (!preBaseRow && !seenBase.has(chunk.chrBase)) {
        seenBase.add(chunk.chrBase);
      }
      baseChrMax.set(chunk.chrBase, Math.max(baseChrMax.get(chunk.chrBase) ?? 0, chunk.bp2Base));
      baseChrMin.set(chunk.chrBase, Math.min(baseChrMin.get(chunk.chrBase) ?? 1e21, chunk.bp1Base));

      if (othersMode !== "show" && chunk.isOthers) continue;
      queryChrMax.set(chunk.chrQuery, Math.max(queryChrMax.get(chunk.chrQuery) ?? 0, chunk.bp2Query));
      queryChrMin.set(chunk.chrQuery, Math.min(queryChrMin.get(chunk.chrQuery) ?? 1e21, chunk.bp1Query));
    }

    const baseChrOrder = Array.from(seenBase).sort((a, b) => a.localeCompare(b));

    return { baseChrMax, baseChrMin, baseChrOrder, queryChrMax, queryChrMin };
  }, [cleanChunks, othersMode, preBaseRow]);

  const baseRow = useMemo(
    () => preBaseRow ?? buildBaseRow(baseChrMax, baseChrMin, baseChrOrder, baseLabel, trackW, othersMode),
    [preBaseRow, baseChrMax, baseChrMin, baseChrOrder, baseLabel, trackW, othersMode]
  );

  // Query row — only chrs that receive ribbons; others stubs when in othersMode
  const queryRow = useMemo<QueryRow>(() => {
    const realChrs = new Set<string>();
    const needsStub = new Set<string>();
    for (const ch of cleanChunks) {
      if (othersMode === "group" && ch.isOthers) needsStub.add(ch.chrBase);
      else if (othersMode === "hide" && ch.isOthers) continue;
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
        });
      }
    }

    const specs: SlotSpec[] = [];
    if (othersMode === "group" && needsStub.size > 0)
      specs.push({ kind: "others", baseChr: "__others__", side: "left" });
    specs.push(...chrSpecs);
    if (othersMode === "group" && needsStub.size > 0)
      specs.push({ kind: "others", baseChr: "__others__", side: "right" });

    return buildQueryRow(specs, queryLabel, trackW);
  }, [cleanChunks, queryChrMax, queryChrMin, queryLabel, trackW, othersMode]);

  // Ribbon geometry
  const ribbons = useMemo<ChunkRibbon[]>(
    () => computeRibbons(cleanChunks, baseRow, queryRow, othersMode),
    [cleanChunks, baseRow, queryRow, othersMode]
  );

  // Extra bottom padding so the tooltip (≈180px) has space below the query bar
  if (preBaseRow) baseRow.y = -2;
  const y1bot = baseRow.y + CHROM_THICKNESS + RIBBON_GAP;
  const y2top = queryRow.y - RIBBON_GAP;

  return {
    baseRow,
    queryRow,
    ribbons,
    y1bot,
    y2top,
  };
};
