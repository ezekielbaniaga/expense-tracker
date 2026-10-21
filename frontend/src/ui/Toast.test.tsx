import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Buttons() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.showSuccess("Saved")}>
        ok
      </button>
      <button type="button" onClick={() => toast.showError("Boom")}>
        fail
      </button>
    </>
  );
}

function setup() {
  render(
    <ToastProvider>
      <Buttons />
    </ToastProvider>,
  );
}

describe("toasts", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a success as a status in the Notifications region and hides it after 4 s", () => {
    setup();
    fireEvent.click(screen.getByText("ok"));
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region.querySelector('[role="status"]')?.textContent).toBe("Saved");
    act(() => void vi.advanceTimersByTime(3900));
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pauses while hovered and restarts the 4 s on leave", () => {
    setup();
    fireEvent.click(screen.getByText("ok"));
    const toast = screen.getByRole("status");
    fireEvent.mouseEnter(toast);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("status")).not.toBeNull();
    fireEvent.mouseLeave(toast);
    act(() => void vi.advanceTimersByTime(4100));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pauses while focused", () => {
    setup();
    fireEvent.click(screen.getByText("ok"));
    const toast = screen.getByRole("status");
    fireEvent.focus(toast);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("status")).not.toBeNull();
    fireEvent.blur(toast);
    act(() => void vi.advanceTimersByTime(4100));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps an error as an alert until it is dismissed", () => {
    setup();
    fireEvent.click(screen.getByText("fail"));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("alert").textContent).toContain("Boom");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
