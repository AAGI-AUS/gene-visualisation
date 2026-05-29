import {
  computeExportSnapshot,
  snapshotFromStores,
  __resetSnapshotCache,
} from "@/src/components/visualizationTab/snapshot";
import { useAppStore } from "@/src/store/useAppStore";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import type { PairInput } from "@/src/hooks/useVisualizationLayout";
import { computeVisualizationLayout } from "@/src/hooks/useVisualizationLayout";
import { makeContiguousRow, makeTranslocationRow } from "@/src/test/factories";

const MBP = 1_000_000;
const defaultIntra = { minLocalEvents: 500, gapStopMbp: 10, driftK: 0.7, complexMin: 2 };

const layoutFor = (pairs: PairInput[], baseLabel = "base") =>
  computeVisualizationLayout(
    pairs,
    baseLabel,
    800,
    1000,
    "show",
    0,
    new Set(),
    false,
    false,
    false,
    0,
    false,
    defaultIntra
  );

describe("computeExportSnapshot", () => {
  it("derives one visible pair per layout, lowercasing queryLabel", () => {
    const pairs: PairInput[] = [
      { queryLabel: "Q1", data: [makeContiguousRow(0, 40 * MBP), makeContiguousRow(1, 40 * MBP)] },
    ];
    const snap = computeExportSnapshot(layoutFor(pairs), pairs, "base");

    expect(snap.pairs).toHaveLength(1);
    expect(snap.pairs[0].queryLabel).toBe("q1");
    expect(snap.pairs[0].chunks).toHaveLength(1);
    expect(snap.pairs[0].chunks[0].chrBase).toBe("1A");
  });

  it("emits no predicted entries when no queryLabel matches a predicting line", () => {
    const pairs: PairInput[] = [{ queryLabel: "q1", data: [makeContiguousRow(0, 40 * MBP)] }];
    const snap = computeExportSnapshot(layoutFor(pairs), pairs, "base");

    expect(snap.predicted.size).toBe(0);
  });

  it("emits a predicted entry when queryLabel matches getPredictingLines", () => {
    // "paragon" is in BASE_PREDICTING_LINES, so any chr should match. The interval
    // [0, 40Mbp) leaves the predicting window (mid - 30Mbp .. mid + 30Mbp) uncovered.
    const pairs: PairInput[] = [{ queryLabel: "Paragon", data: [makeContiguousRow(0, 40 * MBP)] }];
    const snap = computeExportSnapshot(layoutFor(pairs), pairs, "base");

    expect(snap.predicted.has("paragon")).toBe(true);
    expect(snap.predicted.get("paragon")?.has("1A")).toBe(true);
  });
});

describe("snapshotFromStores", () => {
  const seedStores = () => {
    const rows = [
      makeContiguousRow(0, 40 * MBP),
      makeContiguousRow(1, 40 * MBP),
      makeTranslocationRow({
        id: 2,
        chromosomeBase: "1A",
        chromosomeQuery: "2B",
        groupedQuery: "2B",
        p1Base: 100 * MBP,
        p2Base: 140 * MBP,
        p1Query: 0,
        p2Query: 40 * MBP,
      }),
    ];
    useAppStore.setState({
      base: { name: "base.bed", rows: [] },
      centromere: new Map(),
      commonIds: new Set(),
      palette: { "1A": "#3b82f6", "2B": "#10b981" },
      result: [{ name: "q1.bed", rows }],
    });
    useVisualizationStore.setState({
      svgW: 900,
      hiddenThreshold: 0,
      gapBp: 1,
      sharedAxis: true,
      showMarks: false,
      boundaryTicks: false,
      commonOnly: false,
      denoise: false,
      othersMode: "show",
      stripBlankMbp: 0,
      intra: { relabel: false, ...defaultIntra },
    });
  };

  beforeEach(() => {
    __resetSnapshotCache();
    seedStores();
  });

  it("derives the snapshot from current store state", () => {
    const snap = snapshotFromStores();

    expect(snap.pairs).toHaveLength(1);
    expect(snap.pairs[0].queryLabel).toBe("q1");
    // 2 chunks on 1A: a contiguous synteny from rows 0+1, plus the inter-chr translocation.
    expect(snap.pairs[0].chunks).toHaveLength(2);
    expect(snap.baseName).toBe("base");
  });

  it("returns the cached snapshot when stores haven't changed", () => {
    const first = snapshotFromStores();
    const second = snapshotFromStores();
    expect(second).toBe(first);
  });

  it("recomputes when the visualization store changes", () => {
    const first = snapshotFromStores();
    useVisualizationStore.setState({ svgW: 1100 });
    const second = snapshotFromStores();
    expect(second).not.toBe(first);
  });

  it("recomputes when the app store changes", () => {
    const first = snapshotFromStores();
    useAppStore.setState({ base: { name: "renamed.bed", rows: [] } });
    const second = snapshotFromStores();
    expect(second).not.toBe(first);
    expect(second.baseName).toBe("renamed");
  });

  it("falls back to an empty baseName when no base is loaded", () => {
    useAppStore.setState({ base: null });
    expect(snapshotFromStores().baseName).toBe("");
  });
});
