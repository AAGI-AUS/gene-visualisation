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

// inter-translocated tail with a query-only 2B at 500-620M
const twoBTail = [0, 1, 2].map((i) =>
  makeTranslocationRow({
    id: 10 + i,
    chromosomeQuery: "2B",
    groupedQuery: "2B",
    p1Base: (200 + i * 40) * MBP,
    p2Base: (240 + i * 40) * MBP,
    p1Query: (500 + i * 40) * MBP,
    p2Query: (540 + i * 40) * MBP,
  })
);

const isTickLabel = (t: Element) => /^\d+(\.\d+)?[kMG]$/.test(t.textContent ?? "");

const pairGroups = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("svg > g")).filter((g) =>
    g.getAttribute("transform")?.startsWith(`translate(${PAD.left},`)
  );

// Within a pair group, top labels sit above the base bar and bottom labels below the query bar
const labelSides = (g: Element) => {
  const ys = Array.from(g.querySelectorAll("text"))
    .filter(isTickLabel)
    .map((t) => Number(t.getAttribute("y")));
  return { top: ys.includes(PAD.top - 6), bottom: ys.some((y) => y > PAD.top) };
};

// Tick labels split into a top and a bottom run by their y, the smaller y is the base row's
const tickLabelsByRow = (container: HTMLElement) => {
  const labels = Array.from(container.querySelectorAll("text"))
    .filter(isTickLabel)
    .map((t) => ({ text: t.textContent ?? "", y: Number(t.getAttribute("y")) }));
  const topY = Math.min(...labels.map((l) => l.y));
  return {
    top: labels.filter((l) => l.y === topY).map((l) => l.text),
    bottom: labels.filter((l) => l.y !== topY).map((l) => l.text),
  };
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

  it("drops connectors when the rows carry different chrs, marking every tick instead", () => {
    const { container } = renderCanvas([{ name: "q1.bed", rows: [...basePair.rows, ...twoBTail] }]);

    const { top, bottom } = tickLabelsByRow(container);
    expect(bottom).toEqual(expect.arrayContaining(["500M", "600M"]));
    expect(top).not.toEqual(expect.arrayContaining(["500M", "600M"]));

    // 2B puts the rows on different scales, nothing connects
    expect(container.querySelectorAll('line[stroke-dasharray="5 3"]')).toHaveLength(0);
    const marks = container.querySelectorAll('line[stroke-width="0.5"]:not([stroke-dasharray])');
    expect(marks.length).toBe(9);
  });

  it("keeps connectors between rows that carry the same chrs", () => {
    const { container } = renderCanvas([basePair, { ...basePair, name: "q2.bed" }]);

    const connectors = container.querySelectorAll('line[stroke-dasharray="5 3"]');
    expect(connectors.length).toBe(6);
    for (const line of connectors) {
      expect(Number(line.getAttribute("x1"))).toBeCloseTo(Number(line.getAttribute("x2")), 5);
    }
  });

  describe("scale-run labels", () => {
    // Four tracks, so the runs are [0], [1], [2,3].
    // base 1A----
    //   q1 1A---- 2B----
    //   q2 1A----
    //   q3 1A----
    const brokenThenPaired = (): Result => [
      { name: "q1.bed", rows: [...basePair.rows, ...twoBTail] },
      { ...basePair, name: "q2.bed" },
      { ...basePair, name: "q3.bed" },
    ];

    it("provides correct labels", () => {
      useVisualizationStore.setState({ boundaryTicks: true, denoise: false });
      const groups = pairGroups(renderCanvas(brokenThenPaired()).container);

      // labels drawn at top and bottom of track
      expect(labelSides(groups[0])).toEqual({ top: true, bottom: true });
      // no label drawn
      expect(labelSides(groups[1])).toEqual({ top: false, bottom: false });
      // labels drawn at top and bottom of track
      expect(labelSides(groups[2])).toEqual({ top: true, bottom: true });
    });

    it("still closes every run with intra ticks off", () => {
      useVisualizationStore.setState({ boundaryTicks: false, denoise: false });
      const groups = pairGroups(renderCanvas(brokenThenPaired()).container);

      expect(labelSides(groups[0])).toEqual({ top: true, bottom: true });
      expect(labelSides(groups[1])).toEqual({ top: false, bottom: false });
      // labels drawn only at bottom of track
      expect(labelSides(groups[2])).toEqual({ top: false, bottom: true });
    });
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
