import { render, screen } from "@testing-library/react";
import { Parameters } from "@/src/components/sideBar/Parameters";
import { HELP } from "@/src/constants";
import { useAppStore } from "@/src/store/useAppStore";

const WITH_HELP = [
  ["Group threshold", HELP.groupThreshold],
  ["Workers", HELP.workerCount],
] as const;

describe("Parameters help bubbles", () => {
  beforeEach(() => {
    useAppStore.setState({ chromosomes: [], groupThreshold: 0.01, workerCount: 1 });
  });

  it.each(WITH_HELP)("anchors %s help on its own text span", (label, help) => {
    render(<Parameters />);
    const text = screen.getByText(label);

    // The label itself is flex: 1, so anchoring there would arm the whole row.
    expect(text.tagName).toBe("SPAN");
    expect(text).toHaveAttribute("data-help", help);
  });

  it("leaves the self-explanatory base chromosome bare", () => {
    render(<Parameters />);
    expect(screen.getByText("Base chromosome")).not.toHaveAttribute("data-help");
  });

  it("keeps the inputs outside the hover zone", () => {
    render(<Parameters />);
    expect(screen.getByRole("combobox")).not.toHaveAttribute("data-help");
    for (const input of screen.getAllByRole("spinbutton")) {
      expect(input).not.toHaveAttribute("data-help");
    }
  });
});
