import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

function setup(props: Partial<Parameters<typeof Pagination>[0]> = {}) {
  const onPage = vi.fn();
  const onSize = vi.fn();
  render(<Pagination page={1} totalPages={3} size={20} defaultSize={20} onPage={onPage} onSize={onSize} {...props} />);
  return { onPage, onSize };
}

describe("Pagination", () => {
  it("shows the position and moves a page at a time", () => {
    const { onPage } = setup();
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPage.mock.calls).toEqual([[0], [2]]);
  });

  it("disables Previous on the first page and Next on the last", () => {
    setup({ page: 0 });
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables Next on the last page and shows page 1 of 1 for no pages", () => {
    setup({ page: 2 });
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows page 1 of 1 when there are no pages and disables both buttons without data", () => {
    setup({ page: 0, totalPages: 0, disabled: true });
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers 10, 20, 50 and 100, falls back to the default for other sizes, and reports a change", () => {
    const { onSize } = setup({ size: 7 });
    const select = screen.getByLabelText("Page size") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["10", "20", "50", "100"]);
    expect(select.value).toBe("20");
    fireEvent.change(select, { target: { value: "50" } });
    expect(onSize).toHaveBeenCalledWith(50);
  });
});
