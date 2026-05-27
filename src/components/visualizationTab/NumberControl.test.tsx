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

  it("treats 0 as falsy and reports the fallback (|| semantics)", () => {
    const onChange = jest.fn();
    render(<NumberControl label="Gap" onChange={onChange} fallback={7} />);
    fireEvent.change(input(), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith(7);
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
});
