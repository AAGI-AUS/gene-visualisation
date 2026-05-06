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

export interface PairInput {
  data: ResultRow[];
  queryLabel: string;
}

interface Track {
  chrMax: Map<string, number>;
  chrMin: Map<string, number>;
  chrOrder: string[];
  needsOthersStub: boolean;
}

export const useVisualizationLayout = (
  pairs: PairInput[],
  baseLabel: string,
  trackW: number,
  gapBp: number,
  othersMode: OthersMode,
  hiddenThreshold: number
): VisualizationLayout[] => {
  const chunksPerPair = useMemo<Chunk[][]>(
    () =>
      pairs.map(({ data, queryLabel }) => {
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
      }),
    [pairs, gapBp, hiddenThreshold]
  );

  const cleanChunksPerPair = useMemo<Chunk[][]>(
    () => (othersMode === "hide" ? chunksPerPair.map((cs) => cs.filter((c) => !c.isOthers)) : chunksPerPair),
    [chunksPerPair, othersMode]
  );

  // Tracks: 0..N. Track i is the row shared by pair (i-1)'s query side and pair i's base side.
  // bp bounds for a chromosome on track i:
  //   - track 0: union of pair 0 chunks' chrBase
  //   - track i > 0: pair (i-1) chunks' chrQuery defines the chr set; pair i chunks' chrBase
  //     widens bounds only for chrs already present from that query side
  const tracks = useMemo<Track[]>(() => {
    const out: Track[] = [];
    const trackCount = pairs.length + 1;

    for (let i = 0; i < trackCount; i++) {
      const chrMax = new Map<string, number>();
      const chrMin = new Map<string, number>();
      let needsOthersStub = false;

      if (i > 0) {
        for (const c of cleanChunksPerPair[i - 1]) {
          if (othersMode === "group" && c.isOthers) {
            needsOthersStub = true;
            continue;
          }
          if (othersMode !== "show" && c.isOthers) continue;
          chrMax.set(c.chrQuery, Math.max(chrMax.get(c.chrQuery) ?? 0, c.bp2Query));
          chrMin.set(c.chrQuery, Math.min(chrMin.get(c.chrQuery) ?? 1e21, c.bp1Query));
        }
      }

      if (i < pairs.length) {
        const restrictToPrevQuery = i > 0;
        for (const c of cleanChunksPerPair[i]) {
          if (othersMode !== "show" && c.isOthers) continue;
          if (restrictToPrevQuery && !chrMin.has(c.chrBase)) continue;
          chrMax.set(c.chrBase, Math.max(chrMax.get(c.chrBase) ?? 0, c.bp2Base));
          chrMin.set(c.chrBase, Math.min(chrMin.get(c.chrBase) ?? 1e21, c.bp1Base));
        }
      }

      const chrOrder = Array.from(chrMin.keys()).sort((a, b) => a.localeCompare(b));
      out.push({ chrMax, chrMin, chrOrder, needsOthersStub });
    }
    return out;
  }, [cleanChunksPerPair, othersMode, pairs.length]);

  return useMemo<VisualizationLayout[]>(() => {
    return pairs.map((pair, p) => {
      const baseTrack = tracks[p];
      const queryTrack = tracks[p + 1];

      const baseRow = buildBaseRow(
        baseTrack.chrMax,
        baseTrack.chrMin,
        baseTrack.chrOrder,
        p === 0 ? baseLabel : "",
        trackW,
        othersMode
      );

      const chrSpecs: SlotSpec[] = queryTrack.chrOrder.map((chr) => {
        const p1 = queryTrack.chrMin.get(chr) ?? 0;
        return {
          kind: "chr",
          chr,
          p1,
          bpLen: Math.max(queryTrack.chrMax.get(chr) ?? 1, 1) - p1,
        };
      });

      const specs: SlotSpec[] = [];
      const showOthersStubs = othersMode === "group" && queryTrack.needsOthersStub;
      if (showOthersStubs) specs.push({ kind: "others", baseChr: "__others__", side: "left" });
      specs.push(...chrSpecs);
      if (showOthersStubs) specs.push({ kind: "others", baseChr: "__others__", side: "right" });

      const queryRow = buildQueryRow(specs, pair.queryLabel, trackW);

      if (p > 0) baseRow.y = -2;

      const ribbons = computeRibbons(cleanChunksPerPair[p], baseRow, queryRow, othersMode);
      const y1bot = baseRow.y + CHROM_THICKNESS + RIBBON_GAP;
      const y2top = queryRow.y - RIBBON_GAP;

      return { baseRow, queryRow, ribbons, y1bot, y2top };
    });
  }, [pairs, tracks, cleanChunksPerPair, baseLabel, trackW, othersMode]);
};
