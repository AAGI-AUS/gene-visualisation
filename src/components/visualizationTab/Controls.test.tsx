import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { Controls } from "@/src/components/visualizationTab/Controls";
import { COMMON_CHR_THRESHOLD, HELP } from "@/src/constants";
import { useVisualizationStore } from "@/src/store/useVisualizationStore";

const renderControls = () => render(<Controls svgRef={createRef<SVGSVGElement>()} />);

// The others-mode and intra-ticks toggles are commented out in Controls.tsx.
const WIRED = [
  ["Gap", HELP.gapBp],
  ["Hidden threshold", HELP.hiddenThreshold],
  ["Strip blank", HELP.stripBlankMbp],
  [`Common ≥${Math.round(COMMON_CHR_THRESHOLD * 100)}%`, HELP.commonOnly],
  ["Denoise", HELP.denoise],
  ["Shared axis", HELP.sharedAxis],
  ["Marks", HELP.showMarks],
  ["Intra relabel", HELP.intraRelabel],
  ["Min local events", HELP.minLocalEvents],
  ["Gap stop", HELP.gapStopMbp],
  ["Drift cutoff", HELP.driftK],
  ["Complex min", HELP.complexMin],
] as const;

describe("Controls help wiring", () => {
  beforeEach(() => {
    useVisualizationStore.setState({ fontSize: 11 });
  });

  it.each(WIRED)("gives %s its own help text", (label, help) => {
    renderControls();
    expect(screen.getByText(label)).toHaveAttribute("data-help", help);
  });

  it("keeps every knob's text distinct, so no two share a copy-pasted entry", () => {
    const texts = WIRED.map(([, help]) => help);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("leaves the self-explanatory render knobs bare", () => {
    renderControls();
    expect(screen.getByText("Font")).not.toHaveAttribute("data-help");
    expect(screen.getByText("Width")).not.toHaveAttribute("data-help");
  });

  // Font/Width carry helpAlign="end" for when their HELP entries get filled in.
  it.each(WIRED)("opens %s's bubble from the left", (label) => {
    renderControls();
    expect(screen.getByText(label)).toHaveAttribute("data-help-align", "start");
  });
});
