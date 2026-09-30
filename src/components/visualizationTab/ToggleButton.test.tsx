import { render, screen, fireEvent } from "@testing-library/react";
import { ToggleButton } from "@/src/components/visualizationTab/ToggleButton";

describe("ToggleButton", () => {
  it("renders its text label", () => {
    render(<ToggleButton active={false} onClick={() => {}} text="Denoise" />);
    expect(screen.getByRole("button", { name: /denoise/i })).toBeInTheDocument();
  });

  it("calls onClick once when pressed", () => {
    const onClick = jest.fn();
    render(<ToggleButton active={false} onClick={onClick} text="Denoise" />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is type=button so it never submits an enclosing form", () => {
    render(<ToggleButton active onClick={() => {}} text="Denoise" />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("carries no help attributes when no help text is given", () => {
    render(<ToggleButton active={false} onClick={() => {}} text="Denoise" />);
    expect(screen.getByText("Denoise")).not.toHaveAttribute("data-help");
  });

  it("anchors the help bubble on the text, not the whole pill", () => {
    render(<ToggleButton active={false} onClick={() => {}} text="Denoise" help="Drops noise" />);
    expect(screen.getByText("Denoise")).toHaveAttribute("data-help", "Drops noise");
    expect(screen.getByText("Denoise")).toHaveAttribute("data-help-align", "start");
    expect(screen.getByRole("button")).not.toHaveAttribute("data-help");
  });

  it("honours an explicit help alignment", () => {
    render(<ToggleButton active={false} onClick={() => {}} text="Marks" help="Centromeres" helpAlign="end" />);
    expect(screen.getByText("Marks")).toHaveAttribute("data-help-align", "end");
  });
});
