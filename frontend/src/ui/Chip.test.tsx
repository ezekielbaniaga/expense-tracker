import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategoryChip, ChipGroup, SegmentedControl } from "./Chip";

const options = [
  { value: "FOOD", label: "Food" },
  { value: "BILLS", label: "Bills" },
];

describe("ChipGroup", () => {
  it("is a named group of radios and reports the chosen value", () => {
    const onChange = vi.fn();
    render(<ChipGroup legend="Category" name="cat" options={options} value="FOOD" onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Category" })).toBeTruthy();
    const food = screen.getByRole("radio", { name: "Food" }) as HTMLInputElement;
    expect(food.checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Bills" }));
    expect(onChange).toHaveBeenCalledWith("BILLS");
  });

  it("shows a check icon only on the selected chip", () => {
    render(<ChipGroup legend="Category" name="cat" options={options} value="FOOD" onChange={() => {}} />);
    const food = screen.getByRole("radio", { name: "Food" }).closest("label")!;
    const bills = screen.getByRole("radio", { name: "Bills" }).closest("label")!;
    expect(food.classList.contains("chip--selected")).toBe(true);
    expect(food.querySelector("svg")).not.toBeNull();
    expect(bills.querySelector("svg")).toBeNull();
  });

  it("with multiple uses checkboxes and returns the list", () => {
    const onChange = vi.fn();
    render(
      <ChipGroup multiple legend="Categories" name="cats" options={options} value={["FOOD"]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Bills" }));
    expect(onChange).toHaveBeenLastCalledWith(["FOOD", "BILLS"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Food" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("SegmentedControl", () => {
  it("is a radio group with one selected segment", () => {
    const onChange = vi.fn();
    const modes = [
      { value: "system", label: "System" },
      { value: "dark", label: "Dark" },
    ];
    render(<SegmentedControl legend="Theme" name="theme" options={modes} value="system" onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Theme" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });
});

describe("CategoryChip", () => {
  it("shows the label and an icon on the category fill", () => {
    const { container } = render(<CategoryChip category="FOOD" />);
    const chip = container.querySelector(".chip")!;
    expect(chip.textContent).toBe("Food");
    expect(chip.classList.contains("chip--cat-food")).toBe(true);
    expect(chip.querySelector("svg")).not.toBeNull();
  });

  it("is neutral for null and unknown categories", () => {
    const { container } = render(
      <>
        <CategoryChip category={null} />
        <CategoryChip category="TRAVEL" />
      </>,
    );
    const chips = container.querySelectorAll(".chip");
    expect(chips[0].classList.contains("chip--cat-unknown")).toBe(true);
    expect(chips[1].classList.contains("chip--cat-unknown")).toBe(true);
    expect(chips[1].textContent).toBe("TRAVEL");
  });
});
