import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Dialog } from "./Dialog";

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Dialog title="Sure?" onClose={() => setOpen(false)}>
          <button onClick={() => setOpen(false)}>No</button>
          <button data-autofocus>Yes</button>
        </Dialog>
      )}
    </>
  );
}

describe("Dialog", () => {
  it("opens labelled by its title and focuses the data-autofocus control", () => {
    render(<Host />);
    fireEvent.click(screen.getByText("Open"));
    const dialog = screen.getByRole("dialog", { name: "Sure?" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(document.activeElement).toBe(screen.getByText("Yes"));
  });

  it("closes on the cancel event (Escape)", () => {
    render(<Host />);
    fireEvent.click(screen.getByText("Open"));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
