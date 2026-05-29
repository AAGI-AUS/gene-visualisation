/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import { render } from "@testing-library/react";
import { RibbonLayer } from "@/src/components/visualizationTab/RibbonLayer";
import type { ChunkRibbon } from "@/types";
import { makeChunk } from "@/src/test/factories";

const ribbon = (chunkId: string, overrides: Partial<Omit<ChunkRibbon, "chunk">> = {}): ChunkRibbon => ({
  chunk: makeChunk({ id: chunkId }),
  bxs: 10,
  bxe: 30,
  qxs: 100,
  qxe: 200,
  ...overrides,
});

const renderRibbons = (ribbons: ChunkRibbon[], hoverChunk: string | null = null) =>
  render(
    <svg>
      <RibbonLayer ribbons={ribbons} y1bot={10} y2top={50} hoverChunk={hoverChunk} onMove={() => {}} />
    </svg>
  );

describe("RibbonLayer", () => {
  it("renders one <path> per ribbon", () => {
    const { container } = renderRibbons([ribbon("a"), ribbon("b"), ribbon("c")]);
    expect(container.querySelectorAll("path")).toHaveLength(3);
  });

  it("never emits NaN in the d attribute for finite inputs", () => {
    const { container } = renderRibbons([
      ribbon("a", { bxs: 0, bxe: 0 }),
      ribbon("b", { qxs: 50, qxe: 50 }),
      ribbon("c", { bxs: 5.5, bxe: 6.25, qxs: 200.1, qxe: 199.9 }),
    ]);

    for (const path of container.querySelectorAll("path")) {
      expect(path.getAttribute("d")).not.toMatch(/NaN/);
      // always start with M
      expect(path.getAttribute("d")).toMatch(/^M /);
    }
  });

  it("highlights the hovered ribbon and dims the rest", () => {
    const { container } = renderRibbons([ribbon("hot"), ribbon("cold")], "hot");
    const [hot, cold] = Array.from(container.querySelectorAll("path"));

    expect(hot.getAttribute("stroke")).not.toBe("none");
    expect(cold.getAttribute("stroke")).toBe("none");
    expect(Number(hot.getAttribute("fill-opacity"))).toBeGreaterThan(Number(cold.getAttribute("fill-opacity")));
  });
});
