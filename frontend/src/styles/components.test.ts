import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/components.css", "utf8");
const layout = readFileSync("src/styles/layout.css", "utf8");

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

  // Margins on input/select/button made rows of controls end at different heights; layout spaces them
  it("gives controls no margin and spaces forms and fields with gap", () => {
    const controls = css.slice(0, css.indexOf("/* Controls carry no margin"));
    expect(controls).not.toMatch(/\n(button|input:not\(\[type="checkbox"\]\),\nselect) \{[^}]*margin/);
    expect(css).toMatch(/(^|\n)form \{\s*display: grid;\s*gap: var\(--sp-4\);/);
    expect(css).toMatch(/(^|\n)\.field \{\s*display: grid;\s*gap: var\(--sp-1\);/);
    expect(css).toMatch(/\.filter-bar > button \{\s*flex: 1 1 100%;/);
  });

  // Inputs stopped at 24rem while chips and the Save row ran full width: ragged right edge
  it("gives forms one 28rem column with full-width inputs and flush legends", () => {
    expect(css).toMatch(/(^|\n)form \{[^}]*max-width: 28rem;/);
    expect(css).toMatch(/form:not\(:has\(> \.filter-bar\)\) :is\(input:not\(\[type="checkbox"\]\), select\) \{\s*max-width: none;/);
    expect(css).toMatch(/\.chip-group legend,\s*\.segmented legend \{\s*padding: 0;/);
  });

  // Selected segment: inset ring instead of a border (no double outline); equal-width items; forced-colors border kept
  it("draws the selected segment as a ring on equal-width items", () => {
    expect(css).toMatch(/\.segmented__track \{[^}]*display: inline-grid;\s*grid-auto-flow: column;\s*grid-auto-columns: 1fr;[^}]*padding: 3px;/);
    expect(css).toMatch(/\.segmented__item--selected \{[^}]*box-shadow: inset 0 0 0 2px var\(--accent-strong\);/);
    expect(css).not.toMatch(/\.segmented__item \{[^}]*border: 2px/);
    expect(css).toMatch(/forced-colors: active\) \{[\s\S]*?\.segmented__item--selected \{\s*border: 2px solid Highlight;/);
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

  // The detail page: Delete is a danger-colored ghost, Id and Version sit in a collapsed details block
  it("styles the expense detail actions and technical details", () => {
    expect(css).toMatch(/\.btn--danger-ghost \{\s*color: var\(--danger\);/);
    expect(css).toMatch(/\.detail-actions \{\s*display: flex;/);
    expect(css).toMatch(/\.tech-details summary \{\s*color: var\(--muted\);/);
  });

  // Profile page: header row, warning callout and devices as a divider list
  it("styles the profile header, the .note callout and the device list", () => {
    expect(css).toMatch(/\.profile-header \{\s*display: flex;\s*align-items: center;/);
    expect(css).toMatch(/\.note \{[^}]*border-left: 4px solid/);
    expect(css).toMatch(/\.device \{\s*padding: var\(--sp-3\) 0;\s*border-top: 1px solid var\(--line\);/);
    expect(css).toMatch(/\.device__row \{\s*display: flex;\s*align-items: center;\s*justify-content: space-between;/);
    expect(css).toMatch(/\.device-list \{[^}]*list-style: none;/);
  });
});

// The rem tokens assume 1rem = 16px; a 13px root shrank the whole UI by 19%
describe("base.css root size", () => {
  const base = readFileSync("src/styles/base.css", "utf8");

  it("reserves the scrollbar gutter without forcing a scrollbar", () => {
    expect(base).toMatch(/:root \{[^}]*scrollbar-gutter: stable;/);
    expect(base).not.toMatch(/overflow-y: scroll/);
  });

  it("keeps the root at 100% and sets the text size on body", () => {
    expect(base).toMatch(/:root \{[^}]*font-size: 100%;/);
    expect(base).toMatch(/\nbody \{[^}]*font-size: var\(--fs-base\);/);
  });

  it("sizes h1 --fs-md on phones and --fs-lg from 48rem", () => {
    expect(base).toMatch(/\nh1 \{\s*font-size: var\(--fs-md\);/);
    expect(base).toMatch(/@media \(min-width: 48rem\) \{\s*h1 \{\s*font-size: var\(--fs-lg\);/);
  });

  // anywhere broke short tokens ("Admi/n", "12.5/0"); narrow columns stay on one line, description wraps
  it("keeps narrow table columns on one line and breaks words only when they must", () => {
    expect(layout).toMatch(/\btd \{\s*overflow-wrap: break-word;/);
    expect(css).toMatch(/\.table-narrow \{\s*width: 1%;\s*white-space: nowrap;/);
    expect(css).toMatch(/\.table-amount \{\s*text-align: right;\s*font-variant-numeric: tabular-nums;/);
    expect(css).toMatch(/@media \(min-width: 48rem\) \{\s*[^}]*\.expense-table__amount \{\s*width: 1%;\s*white-space: nowrap;/);
  });
});
