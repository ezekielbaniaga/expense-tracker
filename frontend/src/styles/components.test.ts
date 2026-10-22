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

  // Desktop table: aligned amounts, no repeated dates under day headers, whole row is the link
  it("tidies the desktop expense table at every width", () => {
    expect(css).toMatch(/\.expense-table__amount,\s*\.expense-table th\.expense-table__amount \{\s*text-align: right;\s*font-variant-numeric: tabular-nums;/);
    expect(css).toMatch(/(^|\n)\.expense-table--grouped \.expense-table__date \{\s*display: none;/);
    expect(css).toMatch(/(^|\n)\.expense-table__description a \{\s*text-decoration: none;/);
    expect(css).toMatch(/(^|\n)\.expense-table__description a::after \{\s*content: "";\s*position: absolute;\s*inset: 0;/);
    expect(css).toMatch(/(^|\n)\.expense-table tbody > tr:not\(\.expense-table__day\):hover \{\s*background: var\(--surface-2\);/);
  });
});

describe("summary bar colours", () => {
  it.each(["food", "transport", "bills", "entertainment", "unknown"])(
    "fills the %s segment and dot with the strong token, not the pastel",
    (cat) => {
      const rule = css.match(
        new RegExp(`\\.summary-bar__segment\\.chip--cat-${cat},\\s*\\.summary-legend__swatch\\.chip--cat-${cat}\\s*\\{([^}]*)\\}`),
      );
      expect(rule?.[1]).toContain(`background: var(--cat-${cat}-strong)`);
    },
  );
});

describe("admin user filter bar", () => {
  it("lays the fields and Search out in one row aligned to the input bottoms", () => {
    expect(css).toMatch(/(^|\n)\.filter-bar \{\s*display: flex;\s*flex-wrap: wrap;\s*align-items: end;\s*gap:/);
  });

  // The admin user page: back link with chevron, form-actions row under the Access card
  it("styles the back link and the form-actions row used by the admin user page", () => {
    expect(css).toMatch(/\.back-link \{\s*display: inline-flex;\s*align-items: center;/);
    expect(css).toMatch(/(^|\n)\.form-actions \{\s*position: sticky;/);
  });
});
