import { describe, expect, it } from "vitest";
import { HUE_COUNT, hueFor, initials } from "./initials";

describe("initials", () => {
  it("matches the documented examples", () => {
    expect(initials("Ezekiel Baniaga")).toBe("EB");
    expect(initials("ezekiel.baniaga")).toBe("EB");
    expect(initials("zek")).toBe("ZE");
    expect(initials("admin")).toBe("AD");
    expect(initials("j")).toBe("J");
  });

  it("uses the first and last word", () => {
    expect(initials("Mary Jane Watson")).toBe("MW");
  });

  it("splits camelCase and keeps digits", () => {
    expect(initials("ezekielBaniaga")).toBe("EB");
    expect(initials("user42")).toBe("US");
    expect(initials("42")).toBe("42");
  });

  it("counts code points, not UTF-16 units", () => {
    expect(initials("😀😁😂")).toBe("😀😁");
    expect(initials("😀 😂")).toBe("😀😂");
  });

  it("falls back to a question mark", () => {
    expect(initials("")).toBe("?");
    expect(initials("  ._- ")).toBe("?");
  });
});

describe("hueFor", () => {
  it("is stable and within the six hues", () => {
    const id = "6f1c2a3e-1111-4222-8333-444455556666";
    expect(hueFor(id)).toBe(hueFor(id));
    for (const x of [id, "", "a", "😀", "b".repeat(500), "x-1", "x-2", "x-3"]) {
      const h = hueFor(x);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(HUE_COUNT);
    }
  });

  it("spreads different ids over more than one hue", () => {
    const hues = new Set(Array.from({ length: 30 }, (_, i) => hueFor(`user-${i}`)));
    expect(hues.size).toBeGreaterThan(1);
  });
});
