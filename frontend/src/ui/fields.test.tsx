import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AmountField, DateField, SelectField, TextField } from "./fields";

describe("fields", () => {
  it("associates the label with the control", () => {
    render(<TextField id="name" label="Name" />);
    const input = screen.getByLabelText("Name");
    expect(input.id).toBe("name");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("marks the control invalid and describes it by the error", () => {
    render(<TextField id="name" label="Name" error="Name is required" />);
    const input = screen.getByLabelText("Name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBe("name-error");
    expect(document.getElementById(describedBy!)?.textContent).toBe("Name is required");
  });

  it("renders a select with its options and error", () => {
    render(
      <SelectField id="category" label="Category" error="Pick one" defaultValue="">
        <option value="">Select...</option>
        <option value="FOOD">Food</option>
      </SelectField>,
    );
    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(select, { target: { value: "FOOD" } });
    expect(select.value).toBe("FOOD");
  });

  it("renders a date input", () => {
    render(<DateField id="date" label="Date" max="2026-01-01" />);
    const input = screen.getByLabelText("Date") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.max).toBe("2026-01-01");
  });

  it("renders the amount with the decimal keypad", () => {
    render(<AmountField id="amount" label="Amount" error="Too big" />);
    const input = screen.getByLabelText("Amount");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("aria-describedby")).toBe("amount-error");
  });
});
