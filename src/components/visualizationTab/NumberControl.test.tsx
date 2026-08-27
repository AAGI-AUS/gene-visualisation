import { render, screen, fireEvent } from "@testing-library/react";
import { NumberControl } from "@/src/components/visualizationTab/NumberControl";

const input = () => screen.getByRole("spinbutton");

describe("NumberControl", () => {
  it("renders the label and unit", () => {
    render(<NumberControl label="Gap" unit="kbp" onChange={() => {}} />);
    expect(screen.getByText("Gap")).toBeInTheDocument();
    expect(screen.getByText("kbp")).toBeInTheDocument();
  });

  it("reports the parsed number on change", () => {
    const onChange = jest.fn();
    render(<NumberControl label="Gap" onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "42" } });
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it("falls back when the input is cleared to a non-number", () => {
    const onChange = jest.fn();
    render(<NumberControl label="Gap" onChange={onChange} fallback={7} defaultValue={5} />);
    fireEvent.change(input(), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("reports 0 instead of the fallback when the input parses to zero", () => {
    const onChange = jest.fn();
    render(<NumberControl label="Gap" onChange={onChange} fallback={7} />);
    fireEvent.change(input(), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("forwards the default min of 0 to the input", () => {
    render(<NumberControl label="Gap" onChange={() => {}} />);
    expect(input()).toHaveAttribute("min", "0");
  });

  it("defaults the fallback to min when no fallback is given", () => {
    const onChange = jest.fn();
    render(<NumberControl label="Gap" onChange={onChange} min={5} defaultValue={9} />);
    fireEvent.change(input(), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("carries no help attributes when no help text is given", () => {
    render(<NumberControl label="Gap" onChange={() => {}} />);
    expect(screen.getByText("Gap")).not.toHaveAttribute("data-help");
  });

  it("anchors the help bubble on the label", () => {
    render(<NumberControl label="Gap" onChange={() => {}} help="Block split distance" />);
    expect(screen.getByText("Gap")).toHaveAttribute("data-help", "Block split distance");
    expect(screen.getByText("Gap")).toHaveAttribute("data-help-align", "start");
  });

  it("honours an explicit help alignment", () => {
    render(<NumberControl label="Width" onChange={() => {}} help="Canvas width" helpAlign="end" />);
    expect(screen.getByText("Width")).toHaveAttribute("data-help-align", "end");
  });

  it("keeps the help bubble off the input and the unit", () => {
    render(<NumberControl label="Gap" unit="kbp" onChange={() => {}} help="Block split distance" />);
    expect(input()).not.toHaveAttribute("data-help");
    expect(screen.getByText("kbp")).not.toHaveAttribute("data-help");
    expect(screen.getByText("Gap")).toHaveAttribute("data-help");
  });
});
