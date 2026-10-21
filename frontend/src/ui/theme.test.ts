import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAccent, applyTheme, readAccent, readTheme } from "./theme";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-accent");
});

describe("theme", () => {
  it("round trips a stored theme and accent", () => {
    localStorage.setItem("ui.theme", "dark");
    localStorage.setItem("ui.accent", "mint");
    expect(readTheme()).toBe("dark");
    expect(readAccent()).toBe("mint");
    applyTheme("dark");
    applyAccent("mint");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-accent")).toBe("mint");
  });

  it("defaults when nothing is stored or the values are invalid", () => {
    expect(readTheme()).toBe("system");
    expect(readAccent()).toBe("lavender");
    localStorage.setItem("ui.theme", "neon");
    localStorage.setItem("ui.accent", "<script>");
    expect(readTheme()).toBe("system");
    expect(readAccent()).toBe("lavender");
  });

  it("defaults when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readTheme()).toBe("system");
    expect(readAccent()).toBe("lavender");
  });

  it("removes data-theme for system", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
