/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import { render, screen, fireEvent } from "@testing-library/react";
import { SummaryTab } from "@/src/components/summaryTab/SummaryTab";
import type { SummaryBar, SummaryChunk } from "@/src/store/useAppStore";
import { useAppStore } from "@/src/store/useAppStore";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";
import { exportSvg } from "@/src/components/visualizationTab/utils";
import { makeBedRow } from "@/src/test/factories";

jest.mock("@/src/components/visualizationTab/utils", () => ({
  ...jest.requireActual("@/src/components/visualizationTab/utils"),
  exportSvg: jest.fn(),
}));

const seed = (
  chromosomes: string[],
  chrMax: Record<string, number>,
  bars: (chr: string) => Promise<SummaryBar>
) => {
  const rows = chromosomes.map((chr) => makeBedRow({ chromosome: chr, p2: chrMax[chr] }));
  useAppStore.setState({
    base: { name: "base.bed", rows },
    chromosomes,
    queryFiles: [],
    groupThreshold: 0.01,
    buildSummaryBar: jest.fn(bars),
  });
  useVisualizationStore.setState({ fontSize: 11, gapBp: 100, hiddenThreshold: 10 });
};

const chunk = (bp1: number, bp2: number, coverage: number): SummaryChunk => ({ bp1, bp2, coverage });

// 1A: core 50/100 = 0.5; 2B: core 50/200 = 0.25. Genome-wide core = 100/300 -> 33%.
const twoChrBars = (chr: string): Promise<SummaryBar> =>
  Promise.resolve(
    chr === "1A" ? { chr, chunks: [chunk(0, 100, 0.5)] } : { chr, chunks: [chunk(0, 200, 0.25)] }
  );

describe("SummaryTab", () => {
  beforeEach(() => {
    (exportSvg as jest.Mock).mockClear();
  });

  it("shows an empty state when there are no chromosomes", () => {
    seed([], {}, () => Promise.resolve({ chr: "", chunks: [] }));
    render(<SummaryTab />);
    expect(screen.getByText("No data to summarize")).toBeInTheDocument();
  });

  it("renders the bar scaffold and chromosome labels once loaded", async () => {
    seed(["1A", "2B"], { "1A": 100, "2B": 200 }, twoChrBars);
    render(<SummaryTab />);

    await screen.findByText("Overall");
    expect(screen.getByText("1A")).toBeInTheDocument();
    expect(screen.getByText("2B")).toBeInTheDocument();
  });

  it("computes the genome-wide core and accessory percentages", async () => {
    seed(["1A", "2B"], { "1A": 100, "2B": 200 }, twoChrBars);
    render(<SummaryTab />);

    await screen.findByText("Overall");
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("draws one gray chunk rect per summary chunk", async () => {
    seed(["1A"], { "1A": 100 }, () =>
      Promise.resolve({ chr: "1A", chunks: [chunk(0, 50, 0.4), chunk(50, 100, 0.8)] })
    );
    const { container } = render(<SummaryTab />);

    await screen.findByText("Overall");
    // gray(0.4) and gray(0.8) -> rgb fills; the white bg + outlines use named/none fills.
    const grayRects = Array.from(container.querySelectorAll("rect")).filter((r) =>
      r.getAttribute("fill")?.startsWith("rgb(")
    );
    expect(grayRects).toHaveLength(2);
  });

  it("keeps export disabled and hides the overall bar while computing", () => {
    // A pending promise never resolves, so the tab stays in its computing state.
    seed(["1A", "2B"], { "1A": 100, "2B": 200 }, () => new Promise<SummaryBar>(() => {}));
    render(<SummaryTab />);

    expect(screen.getByRole("button", { name: /export svg/i })).toBeDisabled();
    expect(screen.queryByText("Overall")).not.toBeInTheDocument();
  });

  it("exports the svg when the enabled export button is clicked", async () => {
    seed(["1A", "2B"], { "1A": 100, "2B": 200 }, twoChrBars);
    render(<SummaryTab />);

    await screen.findByText("Overall");
    const button = screen.getByRole("button", { name: /export svg/i });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(exportSvg).toHaveBeenCalledTimes(1);
    expect(exportSvg).toHaveBeenCalledWith(expect.anything(), "baseline-summary.svg");
  });

  it("passes gap (kbp -> bp) and hidden threshold through to buildSummaryBar", async () => {
    seed(["1A"], { "1A": 100 }, () => Promise.resolve({ chr: "1A", chunks: [chunk(0, 100, 0.5)] }));
    render(<SummaryTab />);

    await screen.findByText("Overall");
    const build = useAppStore.getState().buildSummaryBar as jest.Mock;
    expect(build).toHaveBeenCalledWith("1A", 100 * 1000, 10);
  });

  const coreMarkerY = (container: HTMLElement) => {
    const marker = container.querySelector('line[stroke="red"][stroke-width="1.5"]');
    return marker && Number(marker.getAttribute("y1"));
  };

  it("scales the bar to the chromosome's own max bp across all its base rows", async () => {
    seed(["1A"], { "1A": 300 }, () => Promise.resolve({ chr: "1A", chunks: [chunk(0, 300, 0.5)] }));
    // Two base rows for 1A; chrMax must be the max p2 (300), not the first/last (100).
    const rows = [makeBedRow(), makeBedRow({ p2: 300 })];
    useAppStore.setState({ base: { name: "base.bed", rows } });
    const { container } = render(<SummaryTab />);

    await screen.findByText("Overall");

    // yScale(f) = LEGEND_H(44) + BAR_H(520) - f * BAR_H, so f = 0.5 -> 304.
    expect(coreMarkerY(container)).toBeCloseTo(304, 5);
  });

  it("skips chunks that would render thinner than a pixel", async () => {
    seed(["1A"], { "1A": 520_000 }, () =>
      Promise.resolve({ chr: "1A", chunks: [chunk(0, 100, 0.5), chunk(100, 520_000, 0.5)] })
    );
    const { container } = render(<SummaryTab />);

    await screen.findByText("Overall");
    const grayRects = Array.from(container.querySelectorAll("rect")).filter((r) =>
      r.getAttribute("fill")?.startsWith("rgb(")
    );
    expect(grayRects).toHaveLength(1);
  });
});
