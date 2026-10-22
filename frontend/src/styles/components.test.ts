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

  // Cards that are siblings in a page body touched each other; .stack spaces them
  it("defines a .stack utility that spaces its children with the page gap", () => {
    expect(css).toMatch(/(^|\n)\.stack \{\s*display: grid;\s*gap: var\(--sp-4\);/);
    expect(css).not.toContain(".detail-card");
  });

  // The Filters panel is collapsed at every width, not only on phones
  it("hides the closed filters panel at every width", () => {
    expect(css).toMatch(/(^|\n)\.list-controls__filters\[data-open="false"\] \{\s*display: none;/);
  });

  // The page-size select took the global 24rem max-width; it is now auto-width beside an inline label
  it("sizes the pagination select to its content", () => {
    expect(css).toMatch(/\.pagination select \{\s*width: auto;/);
    expect(css).toMatch(/\.pagination__size \{\s*display: inline-flex;/);
  });

  // The global th, td bottom border drew lines inside each phone card
  it("clears the cell borders inside phone expense cards and keeps Sort by on one line", () => {
    expect(css).toMatch(/\.expense-table td \{\s*padding: 0;\s*border-bottom: 0;/);
    expect(css).toMatch(/\.sort-select label \{\s*white-space: nowrap;/);
    expect(css).toMatch(/\.sort-select select \{\s*width: auto;/);
  });
});
