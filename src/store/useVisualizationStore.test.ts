import { useVisualizationStore } from "@/src/store/useVisualizationStore";

const initialState = useVisualizationStore.getState();
const reset = () => useVisualizationStore.setState(initialState, true);
const get = useVisualizationStore.getState;

afterEach(reset);

describe("setIntra", () => {
  it("merges a patch while leaving other fields untouched", () => {
    get().setIntra({ driftK: 0.5 });
    expect(get().intra).toEqual({ ...initialState.intra, driftK: 0.5 });
  });

  it("floors and rounds minLocalEvents to an integer >= 100", () => {
    get().setIntra({ minLocalEvents: 10.7 });
    expect(get().intra.minLocalEvents).toBe(100);

    get().setIntra({ minLocalEvents: 640.6 });
    expect(get().intra.minLocalEvents).toBe(641);
  });

  it("floors and rounds complexMin to an integer >= 1", () => {
    get().setIntra({ complexMin: 0.2 });
    expect(get().intra.complexMin).toBe(1);

    get().setIntra({ complexMin: 3.6 });
    expect(get().intra.complexMin).toBe(4);
  });

  it("clamps gapStopMbp and driftK at 0 without rounding", () => {
    get().setIntra({ gapStopMbp: -5, driftK: -1 });
    expect(get().intra.gapStopMbp).toBe(0);
    expect(get().intra.driftK).toBe(0);

    get().setIntra({ gapStopMbp: 2.5, driftK: 0.85 });
    expect(get().intra.gapStopMbp).toBe(2.5);
    expect(get().intra.driftK).toBe(0.85);
  });

  it("accepts a functional updater that receives the previous intra state", () => {
    get().setIntra({ driftK: 0.4 });
    get().setIntra((prev) => ({ driftK: prev.driftK + 0.2 }));
    expect(get().intra.driftK).toBeCloseTo(0.6);
  });
});

describe("numeric setters clamp to their floor", () => {
  it("setGapBp floors at 100", () => {
    get().setGapBp(50);
    expect(get().gapBp).toBe(100);
    get().setGapBp(250);
    expect(get().gapBp).toBe(250);
  });

  it("setSvgW floors at 400", () => {
    get().setSvgW(100);
    expect(get().svgW).toBe(400);
    get().setSvgW(900);
    expect(get().svgW).toBe(900);
  });

  it("setFontSize floors at 6", () => {
    get().setFontSize(2);
    expect(get().fontSize).toBe(6);
  });

  it("setHiddenThreshold and setStripBlankMbp floor at 0", () => {
    get().setHiddenThreshold(-3);
    expect(get().hiddenThreshold).toBe(0);
    get().setStripBlankMbp(-3);
    expect(get().stripBlankMbp).toBe(0);
  });
});

describe("toggle setters", () => {
  it("accept a plain value or a functional updater", () => {
    get().setDenoise(false);
    expect(get().denoise).toBe(false);
    get().setDenoise((prev) => !prev);
    expect(get().denoise).toBe(true);
  });

  it("cycle othersMode through a functional updater", () => {
    expect(get().othersMode).toBe("hide");
    get().setOthersMode((prev) => (prev === "hide" ? "show" : "hide"));
    expect(get().othersMode).toBe("show");
  });
});

describe("clearHover", () => {
  it("resets both hoverChunk and tooltip", () => {
    useVisualizationStore.setState({ hoverChunk: "chunk-1", tooltip: {} as never });
    get().clearHover();
    expect(get().hoverChunk).toBeNull();
    expect(get().tooltip).toBeNull();
  });
});
