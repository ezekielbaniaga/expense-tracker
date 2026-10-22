import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

function setup(props: Partial<Parameters<typeof Pagination>[0]> = {}) {
  const onPage = vi.fn();
  const onSize = vi.fn();
  render(<Pagination page={1} totalPages={3} total={45} size={20} defaultSize={20} onPage={onPage} onSize={onSize} {...props} />);
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

  it("disables Next on the last page", () => {
    setup({ page: 2 });
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders nothing before the first response or when everything fits the smallest page size", () => {
    const { container, unmount } = render(
      <Pagination page={0} totalPages={0} total={undefined} size={20} defaultSize={20} onPage={vi.fn()} onSize={vi.fn()} />,
    );
    expect(container.querySelector("nav")).toBeNull();
    unmount();
    for (const total of [0, 7, 10]) {
      const r = render(
        <Pagination page={0} totalPages={total ? 1 : 0} total={total} size={20} defaultSize={20} onPage={vi.fn()} onSize={vi.fn()} />,
      );
      expect(r.container.querySelector("nav")).toBeNull();
      r.unmount();
    }
  });

  it("hides the buttons and status with one page but keeps the size select while there are more rows than 10", () => {
    setup({ page: 0, totalPages: 1, total: 15, size: 50 });
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
    expect(screen.queryByText(/Page 1 of/)).toBeNull();
    expect(screen.getByLabelText("Per page")).toBeTruthy();
  });

  it("hides the size select but keeps the buttons when the rows fit the smallest size", () => {
    setup({ page: 0, totalPages: 2, total: 10, size: 5 });
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    expect(screen.queryByLabelText("Per page")).toBeNull();
  });

  it("offers 10, 20, 50 and 100, falls back to the default for other sizes, and reports a change", () => {
    const { onSize } = setup({ size: 7 });
    const select = screen.getByLabelText("Per page") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["10", "20", "50", "100"]);
    expect(select.value).toBe("20");
    fireEvent.change(select, { target: { value: "50" } });
    expect(onSize).toHaveBeenCalledWith(50);
  });
});
