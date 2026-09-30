import { PAD } from "@/src/constants";
import { useAppStore } from "@/src/store/useAppStore";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import type { PairInput, VisualizationLayout } from "@/src/hooks/useVisualizationLayout";
import { computeVisualizationLayout } from "@/src/hooks/useVisualizationLayout";
import type { PredictedByLine } from "@/src/components/visualizationTab/predicted";
import { buildPredictedPerPair, mergeIntoPredictedByLine } from "@/src/components/visualizationTab/predicted";
import type { Chunk } from "@/types";

export interface VisibleChunkPair {
  queryLabel: string;
  chunks: Chunk[];
}

export interface ExportSnapshot {
  pairs: VisibleChunkPair[];
  predicted: PredictedByLine;
  baseName: string;
}

// Pure: given a layout + the inputs that produced it, derive what the export
// pipeline (CSV / zip / predicted-centromere export) needs. No store reads.
export const computeExportSnapshot = (
  layouts: VisualizationLayout[],
  pairs: PairInput[],
  baseLabel: string
): Omit<ExportSnapshot, "baseName"> => {
  const visiblePairs: VisibleChunkPair[] = layouts.map((l, i) => ({
    queryLabel: pairs[i].queryLabel.toLowerCase(),
    chunks: l.ribbons.map((r) => r.chunk),
  }));
  const predicted = mergeIntoPredictedByLine(buildPredictedPerPair(layouts, pairs, baseLabel), baseLabel);
  return { pairs: visiblePairs, predicted };
};

// Single-slot identity cache. Zustand swaps the state object on every set(),
// so reference equality is sufficient to detect "nothing changed since last call."
let cached: {
  app: ReturnType<typeof useAppStore.getState>;
  viz: ReturnType<typeof useVisualizationStore.getState>;
  snap: ExportSnapshot;
} | null = null;

export const snapshotFromStores = (): ExportSnapshot => {
  const app = useAppStore.getState();
  const viz = useVisualizationStore.getState();
  if (cached && cached.app === app && cached.viz === viz) return cached.snap;

  const pairs: PairInput[] = app.result.map((d) => ({
    data: d.rows,
    queryLabel: d.name.split(".")[0],
    chrExtent: d.chrExtent,
  }));

  const baseLabel = app.base?.name.split(".")[0].toLowerCase() ?? "";
  const trackW = viz.svgW - PAD.left - PAD.right;
  const { relabel, ...intra } = viz.intra;
  const layouts = computeVisualizationLayout(
    pairs,
    baseLabel,
    trackW,
    1000 * viz.gapBp,
    viz.othersMode,
    viz.hiddenThreshold,
    app.commonIds,
    viz.commonOnly,
    viz.denoise,
    viz.sharedAxis,
    viz.stripBlankMbp,
    relabel,
    intra
  );

  const snap: ExportSnapshot = {
    ...computeExportSnapshot(layouts, pairs, baseLabel),
    baseName: app.base?.name.split(".")[0] ?? "",
  };

  cached = { app, viz, snap };
  return snap;
};
