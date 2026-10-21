import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreferencesProvider, usePreferences } from "./preferences";

function Probe() {
  const p = usePreferences();
  return (
    <div>
      <output data-testid="state">
        {[p.theme, p.accent, p.currency || "-", p.density, p.pageSize].join("|")}
      </output>
      <button onClick={() => p.setTheme("dark")}>dark</button>
      <button onClick={() => p.setAccent("mint")}>mint</button>
      <button onClick={() => p.setCurrency("php")}>php</button>
      <button onClick={() => p.setCurrency("not a code")}>bad currency</button>
      <button onClick={() => p.setDensity("compact")}>compact</button>
      <button onClick={() => p.setPageSize(50)}>fifty</button>
      <button onClick={() => p.setPageSize(7)}>seven</button>
    </div>
  );
}

const state = () => screen.getByTestId("state").textContent;

function renderProbe() {
  return render(
    <PreferencesProvider>
      <Probe />
    </PreferencesProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-accent");
});

describe("PreferencesProvider", () => {
  it("starts with the defaults", () => {
    renderProbe();
    expect(state()).toBe("system|lavender|-|comfortable|20");
  });

  it("reads stored values and ignores invalid ones", () => {
    localStorage.setItem("ui.theme", "light");
    localStorage.setItem("ui.accent", "sky");
    localStorage.setItem("ui.currency", "usd");
    localStorage.setItem("ui.density", "tiny");
    localStorage.setItem("ui.pageSize", "33");
    renderProbe();
    expect(state()).toBe("light|sky|USD|comfortable|20");
  });

  it("stores changes and applies theme and accent to the document", () => {
    renderProbe();
    for (const name of ["dark", "mint", "php", "compact", "fifty"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(state()).toBe("dark|mint|PHP|compact|50");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-accent")).toBe("mint");
    expect(localStorage.getItem("ui.theme")).toBe("dark");
    expect(localStorage.getItem("ui.accent")).toBe("mint");
    expect(localStorage.getItem("ui.currency")).toBe("PHP");
    expect(localStorage.getItem("ui.density")).toBe("compact");
    expect(localStorage.getItem("ui.pageSize")).toBe("50");
  });

  it("rejects values outside the allowed set", () => {
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "bad currency" }));
    fireEvent.click(screen.getByRole("button", { name: "seven" }));
    expect(state()).toBe("system|lavender|-|comfortable|20");
  });

  it("keeps working when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderProbe();
    expect(state()).toBe("system|lavender|-|comfortable|20");
    for (const name of ["dark", "mint", "php", "compact", "fifty"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(state()).toBe("dark|mint|PHP|compact|50");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("usePreferences", () => {
  it("throws outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/PreferencesProvider/);
  });
});
