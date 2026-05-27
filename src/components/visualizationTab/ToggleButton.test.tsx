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
});
