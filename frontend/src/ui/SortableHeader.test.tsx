import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SortableHeader } from "./SortableHeader";

const phrases = { asc: "lowest first", desc: "highest first" };

function renderHeader(props: { active: boolean; direction: "asc" | "desc"; onSort?: () => void }) {
  return render(
    <table>
      <thead>
        <tr>
          <SortableHeader label="Amount" phrases={phrases} onSort={props.onSort ?? (() => {})} {...props} />
        </tr>
      </thead>
    </table>,
  );
}

describe("SortableHeader", () => {
  it("sets aria-sort only when active", () => {
    const { unmount } = renderHeader({ active: false, direction: "desc" });
    expect(screen.getByRole("columnheader").getAttribute("aria-sort")).toBeNull();
    unmount();
    renderHeader({ active: true, direction: "asc" });
    expect(screen.getByRole("columnheader").getAttribute("aria-sort")).toBe("ascending");
  });

  it("names the button by the column and calls onSort", () => {
    const onSort = vi.fn();
    renderHeader({ active: true, direction: "desc", onSort });
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    expect(onSort).toHaveBeenCalledTimes(1);
  });

  it("announces the order politely, only when active", () => {
    const { unmount } = renderHeader({ active: false, direction: "desc" });
    expect(screen.getByRole("status").textContent).toBe("");
    unmount();
    renderHeader({ active: true, direction: "desc" });
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("Sorted by amount, highest first");
  });
});
