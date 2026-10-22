import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/components.css", "utf8");

describe("components.css", () => {
  // A bare :has() adds specificity (0,1,2) and beats .chip { display: inline-flex }, so checkbox
  // chips lost their centring. :where() zeroes it so any class wins.
  it("keeps the checkbox label rule at zero class specificity", () => {
    expect(css).toContain('label:where(:has(input[type="checkbox"]))');
    expect(css).not.toMatch(/(^|\n)label:has\(input\[type="checkbox"\]\)/);
  });
});
