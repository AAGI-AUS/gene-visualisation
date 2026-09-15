/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import { createRef } from "react";
import { render } from "@testing-library/react";
import { SyntenyCanvas } from "@/src/components/visualizationTab/SyntenyCanvas";
import type { Result } from "@/src/store/useAppStore";
import { useAppStore } from "@/src/store/useAppStore";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { CHROM_THICKNESS, PAD, ROW_GAP } from "@/src/constants";
import { makeContiguousRow, makeTranslocationRow } from "@/src/test/factories";

const MBP = 1e6;

// Seed both stores so the canvas mounts against a known fixture. Defaults that
// would mask the test (hiddenThreshold filtering, centromere marks) are pinned.
const seedStores = () => {
  useAppStore.setState({
    base: { name: "base.bed", rows: [] },
    centromere: new Map(),
    commonIds: new Set(),
    palette: { "1A": "#3b82f6", "2B": "#10b981" },
  });
  useVisualizationStore.setState({
    svgW: 900,
    hiddenThreshold: 0,
    gapBp: 1_000,
    sharedAxis: true,
    showMarks: false,
    boundaryTicks: false,
    tickIntervalMbp: 100,
  });
};

// One pair, one chr, base/query bp range 0-200Mbp so ticks land at 0, 100M, 200M.
const basePair: Result[number] = {
  name: "q1.bed",
  rows: [0, 1, 2, 3, 4].map((i) => makeContiguousRow(i, 40 * MBP)),
};
const renderCanvas = (data: Result) => {
  const svgRef = createRef<SVGSVGElement>();
  return render(<SyntenyCanvas data={data} svgRef={svgRef} width={900} height={300} />);
};

describe("SyntenyCanvas", () => {
  beforeEach(seedStores);

  it("renders one <path> per visible ribbon across multiple chrs and chunks", () => {
    const translocationRow = makeTranslocationRow({
      id: 6,
      chromosomeBase: "2B",
      chromosomeQuery: "2B",
      groupedQuery: "2B",
      p2Base: 40 * MBP,
      p2Query: 40 * MBP,
    });
    const rows = [...basePair.rows, makeContiguousRow(5, 40 * MBP, 500 * MBP), translocationRow];
    const data: Result = [{ name: "q1.bed", rows }];

    const { container } = renderCanvas(data);
    expect(container.querySelectorAll("path")).toHaveLength(3);

    // 2 chromosome labels each
    const labelText = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(labelText.filter((t) => t === "1A")).toHaveLength(2);
    expect(labelText.filter((t) => t === "2B")).toHaveLength(2);
  });

  it("never emits NaN in any path d attribute", () => {
    const { container } = renderCanvas([basePair]);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.getAttribute("d")).not.toMatch(/NaN/);
    }
  });

  it("places shared-axis ticks at bpToPx of the chr bar for known bps", () => {
    const { container } = renderCanvas([basePair]);

    // 2 bars
    const barLines = container.querySelectorAll('line[stroke-width="2"]');
    expect(barLines.length).toBe(2);
    const barPx = Number(barLines[0].getAttribute("x1"));
    const barRight = Number(barLines[0].getAttribute("x2"));
    const barPw = barRight - barPx;
    expect(barPw).toBeGreaterThan(0);

    // at 0, 100, 200
    const tickLines = container.querySelectorAll('line[stroke-dasharray="5 3"]');
    expect(tickLines.length).toBe(3);

    // 0, 100, 200 -> 0, 0.5, 1 fraction
    const expectedXs = [barPx, barPx + barPw / 2, barPx + barPw];
    const actualXs = Array.from(tickLines)
      .map((l) => Number(l.getAttribute("x1")))
      .sort();
    expectedXs.forEach((expected, i) => expect(actualXs[i]).toBeCloseTo(expected, 5));

    for (const tick of tickLines) {
      expect(Number(tick.getAttribute("x1"))).toBeCloseTo(Number(tick.getAttribute("x2")), 5);
    }
  });

  it("stacks one Group per pair with the expected y offset and shares the middle row", () => {
    const data: Result = [basePair, { ...basePair, name: "q2.bed" }];
    const { container } = renderCanvas(data);

    // Per-pair Groups emitted by LinePair are translated by PAD.left; the
    // legend is also a direct child of the svg, so filter it out by transform.
    const pairGroups = Array.from(container.querySelectorAll("svg > g")).filter((g) =>
      g.getAttribute("transform")?.startsWith(`translate(${PAD.left},`)
    );
    expect(pairGroups).toHaveLength(2);
    expect(pairGroups[0].getAttribute("transform")).toBe(`translate(${PAD.left}, 0)`);
    expect(pairGroups[1].getAttribute("transform")).toBe(
      `translate(${PAD.left}, ${CHROM_THICKNESS + ROW_GAP})`
    );

    // One ribbon per pair.
    expect(container.querySelectorAll("path")).toHaveLength(2);

    // 3 bars
    expect(container.querySelectorAll('line[stroke-width="2"]')).toHaveLength(3);

    // 3 chromosome labels
    const oneALabels = Array.from(container.querySelectorAll("text")).filter((t) => t.textContent === "1A");
    expect(oneALabels).toHaveLength(3);
  });
});
