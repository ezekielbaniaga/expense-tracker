# UI Design Proposal

2026-10-21

Status: implemented (2026-10-21). The body below is the original plan; where it differs, the code and `README.md` (Web UI) are right.

## Context

The web UI (`frontend/`, see `docs/web-ui-proposal.md`) works and is careful about accessibility, but it has
no visual design. This proposal gives it one: a minimal, clean, functional look with mild pastel themes,
light and dark mode, small monospace type, a mobile-first shell with an account menu, and sortable, filterable,
paged expense lists. It also lists the small backend changes the UI needs (filters, sorting, paging, a summary,
optionally a display name) and keeps away from the authentication code.

What the code does today:

- **Styling is one 150-line file.** `frontend/src/styles.css` is plain CSS with `font-family: system-ui`,
  browser-default buttons and inputs, and four hard-coded colors (`#1a5fb4` focus ring, `#a51d2d` errors,
  `#ccc` table lines, `#fff` skip-link background). There are no design tokens, no dark mode and no theme.
- **The shell is a heading plus a row of links.** `ui/Layout.tsx` renders `<h1>Expense Tracker</h1>`,
  "Signed in as **name** (ROLE)", then Expenses / New expense / Archived / Profile / Admin links and a Sign out
  button in one wrapping `<nav>`. On a phone this becomes two or three lines of links before any content.
- **Good accessibility foundations, which this proposal keeps.** Skip link, `PageHeading` that takes focus after
  navigation, `FormAlert` and field errors tied with `aria-describedby`, inline confirms that return focus,
  `TableScroll` regions, `vitest-axe` on every screen (with `color-contrast` disabled, since jsdom cannot compute it).
- **The expense list loads everything.** `ExpenseListPage` calls `GET /api/expense` with `X-API-Version: 1.2`.
  `ExpenseService.getAllExpensesV1_2` loads every active row of the owner, sorts in Java (newest date, then newest
  created) and sums `total_amount`. No filtering, sorting or paging, on the server or in the browser.
- **The browser must not sum amounts.** `api/expense.ts` says so on `ExpenseList.totalAmount`
  ("The server's total. Never sum amounts in the browser."). Any per-category or per-period total the UI shows
  must come from the server.
- **Archived list is unordered from the server.** `GET /api/expense/archived` (unversioned) returns every archived
  row; the browser sorts by `archivedAt` (`sortArchivedDesc`). The list is bounded by the archive retention cleanup.
- **The admin user list already pages.** `AdminUsersPage` keeps `username`, `enabled`, `page`, `size` in the URL;
  `UserService.listUsers` uses a JPA `Specification`, `PageRequest`, `MAX_PAGE_SIZE` and 400 `INVALID_PAGE`.
  Its sort is fixed (oldest first). This is the pattern to copy for expenses.
- **Users have only a username.** `users` has `username`, `role`, `enabled`, `created_at` (plus ids, `version`,
  `password`, `last_modified`); no display name, no email, no photo. `AuthProvider` decodes `username` and `role` from the access token for display only.
- **Amounts are plain numbers.** `formatAmount` prints `toFixed(2)` with no currency or grouping. Dates are
  shown as raw `YYYY-MM-DD`; timestamps as `YYYY-MM-DD HH:MM` (UTC; labelled "(UTC)" on the admin pages and the profile device list, unlabelled on
  the expense detail).
- **Four fixed categories.** `Category` enum: `FOOD`, `TRANSPORT`, `BILLS`, `ENTERTAINMENT`, served by
  `GET /api/expense/categories` and labelled in `CATEGORY_LABELS`.
- **Toasts are errors only.** `ui/Toast.tsx` has `showError` and a Dismiss button; nothing confirms a save or delete.
- **Strict CSP.** `frontend/nginx.conf` sends `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'`.
  No external fonts or scripts, no inline `<script>`/`<style>`, and no `data:` URIs for fonts or images. Vite inlines
  imported assets under 4 KB as `data:` URIs by default (`build.assetsInlineLimit`), which this CSP would block.
- **Dependencies are deliberately few.** React, React Router, TanStack Query, react-hook-form, zod. No component
  library, no CSS framework, no icon package.

## Goals and non-goals

The goal is an app that feels calm and friendly, is quick to use on a phone with one thumb, and shows money
clearly, without giving up any of the existing accessibility or security properties.

**Goals**

- A small design system: color, type, spacing, radius, elevation and motion as CSS custom properties.
- Pastel themes ("accents") that work in light and dark mode, following the OS setting by default with a manual override.
- Small, readable monospace type (JetBrains Mono) with small all-caps labels.
- A mobile-first app shell: top bar with an initials avatar and account menu, a bottom tab bar on phones, a top nav on wide screens.
- Sortable, filterable, paged expense list with server-side sorting and totals; sortable archived and admin lists.
- A friendlier add-expense flow, better empty, loading and success states.
- Backend changes only where the UI needs data it cannot get today: list filters/sort/paging, a summary, optionally a display name.

**Non-goals (for now)**

- Photo upload. The avatar is initials only.
- A component library, a CSS framework (Tailwind, etc.), CSS-in-JS, or an icon package.
- Charts beyond a single category breakdown bar and simple period totals. No chart library.
- Budgets, recurring expenses, receipts, multi-currency amounts, custom categories, restore from archive. These change
  the domain, not the UI; each would need its own proposal.
- Any change to authentication, tokens, sessions, rate limits or security config.
- Offline mode or PWA install (still a non-goal from the web UI proposal).

## Design principles

1. **Content first, chrome last.** The total and the list are the app. Navigation, filters and settings stay
   small and out of the way until they are needed.
2. **One primary action per screen.** "Add expense" on the list, "Save" on a form, "Sign in" on login. Everything
   else is visually secondary (ghost buttons, menu items).
3. **Color carries meaning, softly.** Pastel fills mark categories and the active accent. Text stays dark (light mode)
   or light (dark mode) on top of them, never pastel-on-white. Red is reserved for errors and destructive actions.
4. **Numbers are the hero.** Amounts use the monospace font's even digit widths, right-aligned in tables, large in
   summaries. Never truncated.
5. **Small but not tiny.** Body text 13px, labels 10.5–11px in caps, but every tap target is at least 44×44 px and
   inputs are 16px on touch screens (iOS zooms the page when a focused input is smaller).
6. **Friendly words, no jokes in errors.** Short, warm copy in empty states and confirmations (the Lemonade influence);
   errors stay plain and actionable.
7. **Nothing the server knows better is computed in the browser.** Totals, sorting and paging of the main list come from the API.
8. **Keep what works.** Every existing accessibility behaviour (focus management, live regions, skip link, field
   errors) survives the redesign, and tests keep finding elements by role and name.

## Inspiration

- **Lemonade** (the insurance app): a conversational, one-question-at-a-time flow, a single bold accent on a
  near-white canvas, generous whitespace, rounded cards, cheerful but brief microcopy, a big obvious primary button
  near the thumb. We borrow the *feel*, not the brand: no pink-only identity, no logo, no mascot, no copy lifted from it.
- **LogicLabs design system** (the referenced repo uses JetBrains Mono Medium): small uppercase monospace labels with
  wide letter spacing as the structural voice of the UI.
- **Banking apps** (Monzo, Revolut style): a balance-style hero total, transactions grouped by day, category chips with icons.
- **Linear / Things**: quiet chrome, keyboard friendliness, a command-like density on desktop.

## Visual language

### Color system

All colors are CSS custom properties on `:root`, overridden by `[data-theme="dark"]` and by the OS preference when
the user has not picked a mode. Components use only tokens, never raw hex values.

#### Neutrals

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#FAF8F5` (warm paper) | `#14131A` | Page background |
| `--surface` | `#FFFFFF` | `#1C1B24` | Cards, sheets, menus, inputs |
| `--surface-2` | `#F3F0EC` | `#24232E` | Hover rows, segmented control track, skeletons |
| `--line` | `#E7E3EC` | `#2E2C3A` | Borders, dividers, table rules |
| `--ink` | `#24212F` | `#ECE9F5` | Body text, amounts |
| `--muted` | `#625E73` | `#A6A2B8` | Secondary text, labels, metadata |
| `--danger` | `#B3261E` | `#FFB4AB` | Error text, destructive button |
| `--danger-fill` | `#FCE8E6` | `#3B1D1B` | Error banners, field error background |
| `--success` | `#1C6440` | `#9FE3C1` | Success toast text |

Measured contrast (WCAG 2.x): `--ink` on `--bg` is 14.9:1 light and 15.4:1 dark; `--muted` on `--bg` is
5.9:1 light and 7.5:1 dark, so muted text passes AA even at the small sizes below.

#### Pastel palette

Each pastel has a soft **fill** for backgrounds and chips, an **ink** that is readable on that fill, and a
**strong** shade for solid buttons in light mode. In dark mode the fill turns into a deep tint of the hue and the ink
becomes the light pastel; solid buttons use the pastel ink as background with `--bg` as text.

| Hue | Light fill | Light ink | Light strong | Dark fill | Dark ink |
| --- | --- | --- | --- | --- | --- |
| Rose | `#FFE1EC` | `#8C2251` | `#C93D74` | `#3A1E2B` | `#FFB3CF` |
| Peach | `#FFE6D5` | `#8A3B12` | `#B5531F` | `#3A2419` | `#FFC4A1` |
| Lemon | `#FFF4C2` | `#6B5300` | `#8A6D00` | `#33301A` | `#F5DE7A` |
| Mint | `#D9F5E6` | `#1C6440` | `#25804F` | `#1A3127` | `#9FE3C1` |
| Sky | `#DCEEFF` | `#1D5486` | `#2A6CB0` | `#1A2A3A` | `#A9D2FF` |
| Lavender | `#E9E2FF` | `#4F3A9E` | `#6A52C7` | `#262039` | `#C9BBFF` |

Measured contrast for every hue: ink on fill 6.2–7.0:1 (light) and 8.9–9.9:1 (dark); white on strong 4.8–5.8:1
(light buttons); `--bg` on dark ink 10.6–13.7:1 (dark buttons). All pass AA for normal text.

Rules:

- Pastel fills never carry body text in a pastel color; text on a fill is always that hue's ink.
- A pastel alone never conveys meaning (a category chip always has its label and icon too).
- Avoid red-ish hues for categories so they never read as errors; rose is fine as an accent but not a status.

#### Themes (accents)

A theme is the pastel used for the accent: primary button, active nav item, focus ring, selected chips, avatar
background, summary card tint. Six accents, one per hue, default **Lavender** (calm, reads well in both modes, not
already used by a category).

```css
:root,
[data-accent="lavender"] {
  --accent-fill: var(--lavender-fill);
  --accent-ink: var(--lavender-ink);
  --accent-strong: var(--lavender-strong);
}
[data-accent="mint"] { --accent-fill: var(--mint-fill); /* ... */ }
```

Tokens built on the accent:

| Token | Light | Dark |
| --- | --- | --- |
| `--primary-bg` | `--accent-strong` | `--accent-ink` (the pastel) |
| `--primary-text` | `#FFFFFF` | `--bg` |
| `--focus-ring` | `--accent-strong` | `--accent-ink` |
| `--selected-bg` | `--accent-fill` | `--accent-fill` |
| `--selected-text` | `--accent-ink` | `--accent-ink` |

#### Category colors

Categories get fixed hues, independent of the accent, so a category always looks the same:

| Category | Hue | Icon |
| --- | --- | --- |
| Food | Peach | Fork and knife |
| Transport | Sky | Bus |
| Bills | Lemon | Receipt |
| Entertainment | Mint | Ticket |
| Unknown (newer server) or missing (legacy null) | Neutral (`--surface-2` / `--muted`) | Dot |

When the accent and a category share a hue (e.g. accent Mint), that is fine: chips always carry a label and icon.

#### Light, dark and system mode

- Three modes: **System** (default), **Light**, **Dark**. Stored per browser in `localStorage` (`ui.theme`), read
  inside `try/catch` because storage can throw in private windows.
- `<html>` gets `data-theme="light|dark"` only when the user picked one; with no attribute,
  `@media (prefers-color-scheme: dark)` decides. CSS:

  ```css
  :root { /* light tokens */ color-scheme: light; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { /* dark tokens */ color-scheme: dark; }
  }
  :root[data-theme="dark"] { /* dark tokens */ color-scheme: dark; }
  ```

- `color-scheme` makes native date pickers, selects and scrollbars follow the mode.
- No flash of the wrong theme: the CSP forbids an inline `<script>` in `index.html`, so `main.tsx` reads the stored
  mode and accent and sets the attributes **before** `createRoot(...).render`. The module script runs before first
  paint of the app, and the OS-preference CSS covers the moment before it runs.
- `<meta name="theme-color">` gets two entries with `media="(prefers-color-scheme: ...)"` so the phone status bar matches.

### Typography

**Typeface: JetBrains Mono**, the font LogicLabs uses. It is open source (SIL Open Font License 1.1), so it can be
bundled. Get it from the official JetBrains release (`github.com/JetBrains/JetBrainsMono`), not from the LogicLabs
repo (its own license may differ), and keep `OFL.txt` next to the files.

- Weights: **400 Regular** (body), **500 Medium** (labels, buttons, the LogicLabs look), **700 Bold** (totals, headings).
  Three woff2 files, Latin subset, roughly 25–35 KB each.
- Files copied from the npm package `@fontsource/jetbrains-mono` (Latin subsets of JetBrains' OFL font; decided), not
  added as a dependency. The official release's webfonts are not subset (~90 KB each).
- Self-hosted in `frontend/src/assets/fonts/`, declared with `@font-face` and `font-display: swap`. Same origin, so
  the CSP allows it; no Google Fonts.
- Fallback stack: `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`. Use
  `size-adjust`/`ascent-override` on a fallback `@font-face` if the swap shifts layout noticeably.
- Optional decision (see [Open decisions](#open-decisions)): body text in the system sans (`system-ui`) with mono
  only for labels and numbers. Mono everywhere is more distinctive; mixed is a little easier to read in long text.
  The app has very little long text, so the recommendation is **mono everywhere**.

**Scale** (rem, so browser zoom and the user's default font size still work; px at the default 16px):

| Token | Size | Weight | Case / tracking | Use |
| --- | --- | --- | --- | --- |
| `--fs-caps` | 0.656rem (10.5px) | 500 | UPPERCASE, `letter-spacing: 0.08em` | Field labels, table headers, section labels, chips, tab bar labels |
| `--fs-sm` | 0.75rem (12px) | 400 | normal | Metadata, helper text, timestamps, toasts |
| `--fs-base` | 0.8125rem (13px) | 400 | normal | Body, table cells, list rows, menu items |
| `--fs-md` | 0.9375rem (15px) | 500 | normal | Card titles, page titles on phones |
| `--fs-lg` | 1.125rem (18px) | 700 | normal | Page titles on wide screens, detail amount on phones |
| `--fs-xl` | 1.75rem (28px) | 700 | `letter-spacing: -0.02em` | Hero total, amount input |
| `--fs-input` | 1rem (16px) on `(pointer: coarse)`, `--fs-base` otherwise | 400 | normal | Inputs, selects, textareas |

- Line height 1.5 for body, 1.2 for caps labels and big numbers.
- Caps labels are short words only ("AMOUNT", "CATEGORY", "THIS MONTH"); never whole sentences in caps.
  Write them in normal case in the markup and uppercase them with CSS (`text-transform`) so screen readers do not
  spell them out letter by letter.
- 10.5px is the floor. Nothing smaller, and only in caps at weight 500 where the letterforms are big for their size.
- `font-variant-numeric: tabular-nums` is implicit in a monospace font; amounts align without extra work.

### Spacing, radius, elevation

- **Spacing**: 4px base. Tokens `--sp-1` 4px, `--sp-2` 8px, `--sp-3` 12px, `--sp-4` 16px, `--sp-5` 24px,
  `--sp-6` 32px, `--sp-7` 48px. Page gutter 16px on phones, 24px from 48rem.
- **Radius**: `--r-sm` 6px (chips, inputs), `--r-md` 12px (cards, buttons), `--r-lg` 20px (sheets, hero card),
  `--r-full` 999px (avatar, pills, FAB).
- **Elevation**: mostly flat; borders (`--line`) separate surfaces. Two shadows only:
  `--shadow-1` for menus and the sticky top bar after scroll, `--shadow-2` for sheets and dialogs. In dark mode shadows
  are weaker and surfaces lighten instead.
- **Max widths**: content 60rem (as today), forms 28rem, auth card 24rem.

### Iconography

- About 15 icons, hand-written as small React components in `src/ui/icons.tsx` (inline SVG, `stroke="currentColor"`,
  1.5px stroke, 16 and 20px). Shapes may follow an open-source set such as Lucide (ISC license) with attribution.
- Inline SVG, not imported `.svg` files: imported files under 4 KB become `data:` URIs that the CSP blocks. Also set
  `build.assetsInlineLimit: 0` in `vite.config.ts` so no future asset is inlined by accident.
- Decorative icons get `aria-hidden="true"`; an icon-only button gets an accessible name (`aria-label`).
- Set: plus, list, archive, user, settings/sliders, sun, moon, monitor, log-out, shield (admin), search, filter,
  sort up/down, chevrons, x, check, more (three dots), fork-knife, bus, receipt, ticket, devices.

### Motion

- Durations 120ms (hover, press), 200ms (menus, toasts), 280ms (sheets). Easing `cubic-bezier(.2,.8,.2,1)`.
- Only `opacity` and `transform`. No animated layout.
- `@media (prefers-reduced-motion: reduce)` sets all durations to 0.
- A small press effect on buttons (`transform: scale(.98)`), a gentle slide-up for sheets and toasts. Nothing bounces.

## Components

New shared components live in `src/ui/`. Each one keeps native elements underneath (`<button>`, `<input>`,
`<select>`, `<table>`, `<dialog>`) so behaviour, forms and tests keep working.

| Component | Notes |
| --- | --- |
| `Button` | Variants `primary` (accent), `secondary` (surface + line), `ghost`, `danger`. Sizes `md` (44px) and `sm` (36px visual, 44px hit area via padding/`::after`). `aria-busy` + spinner when pending; keeps its label for screen readers. |
| `IconButton` | Round, 44px, requires `label`. |
| `TextField`, `SelectField`, `DateField` | Caps label above, 16px input on touch, error text below wired through the existing `errorProps`/`FieldError`. Error state: `--danger` border plus icon, not color alone. |
| `AmountField` | Big (`--fs-xl`) centered input with `inputMode="decimal"`, currency prefix if one is set, keeps the existing zod rules. |
| `ChipGroup` | Single- or multi-select pills built on radio/checkbox inputs (visually styled labels), so they are native form controls. Used for categories, periods, theme mode. |
| `SegmentedControl` | Radio group styled as a track with a sliding thumb. Theme mode (System/Light/Dark), list density. |
| `CategoryChip` | Icon + label on the category's fill. Read-only variant for tables. |
| `Card` | Surface, radius, padding; optional caps title. |
| `Avatar` | Circle with initials; sizes 28/32/56/80px; background from the user's hue (see [Account avatar](#account-avatar-and-menu)). `aria-hidden` when next to the visible name. |
| `Menu` | Menu button pattern: `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`/`menuitem`, arrow keys, Home/End, Escape and outside click close, focus returns to the button. On phones it opens as a bottom sheet. |
| `Sheet` / `Dialog` | Native `<dialog>` with `showModal()` (focus trap, Escape and `::backdrop` for free). Bottom sheet on phones, centered on wide screens. Replaces the inline delete confirm. |
| `Toast` | Extends `ui/Toast.tsx` with `showSuccess`. Success: `role="status"`, auto-hides after 4s, pauses on hover/focus. Errors: `role="alert"`, stay until dismissed (as today). Stack bottom-center above the tab bar on phones, bottom-right on desktop. |
| `Skeleton` | Shimmer-free pulsing blocks in `--surface-2`; the existing `role="status"` "Loading ..." text stays, visually hidden. |
| `EmptyState` | Small inline SVG illustration in the accent fill, a short headline, one line of text, one button. |
| `SortableHeader` | `<th aria-sort>` with a `<button>` inside; see [Sorting](#sorting). |
| `Pagination` | Prev/next, "Page 2 of 7", size select; extracted from `AdminUsersPage`. |
| `TableScroll` | Kept as is. |

## App shell and navigation

### Phone (< 48rem)

```
┌──────────────────────────────────────┐
│ ● spendly           [ ⌕ ]   ( EB )   │  top bar, 52px, sticky
├──────────────────────────────────────┤
│                                      │
│   page content                       │
│                                      │
│                                      │
│                              ╭────╮  │
│                              │ ＋ │  │  FAB "Add expense", only on the list
│                              ╰────╯  │
├──────────────────────────────────────┤
│  ▤ EXPENSES   ▢ ARCHIVED   ◯ PROFILE │  bottom tab bar, 56px + safe area
└──────────────────────────────────────┘
```

- **Top bar**: wordmark left (name is an open decision; the app title stays "Expense Tracker" until then), an
  optional search button on the list page, the avatar button right. Sticky; gets `--shadow-1` after scrolling.
- **Bottom tab bar**: Expenses, Archived, Profile (three items; Admin lives in the avatar menu because few users have
  it). Icon + caps label, active item in the accent fill. `nav aria-label="Main"`, links with `aria-current="page"`
  (as today). Padding includes `env(safe-area-inset-bottom)`; `index.html` viewport gets `viewport-fit=cover`.
- **Add expense**: a floating action button on the list page (bottom-right, above the tab bar). Alternative: a fourth,
  center tab "Add". Open decision; the FAB keeps the tab bar to three and is the common pattern.
- **Back**: detail and form pages show a back arrow in the top bar instead of the "Back to expenses" paragraph link.

### Wide screens (≥ 48rem)

```
┌───────────────────────────────────────────────────────────────────────┐
│ ● spendly    Expenses   Archived   Admin          [+ Add expense] (EB)│
├───────────────────────────────────────────────────────────────────────┤
│         ┌─────────────────────────────────────────────────┐           │
│         │  content, max 60rem                             │           │
│         └─────────────────────────────────────────────────┘           │
└───────────────────────────────────────────────────────────────────────┘
```

- Top nav in the bar; the bottom tab bar is hidden. "Add expense" is a primary button in the bar.
- Profile is reached through the avatar menu (no separate nav link needed); Admin shows as a nav link for admins.
- Keyboard shortcuts (optional, later phase): `n` new expense, `/` focus search, `g e` / `g a` go to lists. Ignored
  while typing in an input; listed in a "Keyboard shortcuts" menu item.

### What stays

- The skip link (restyled, still first in tab order).
- `<main id="main" tabIndex={-1}>` and the `ErrorBoundary` keyed by path.
- `PageHeading` focus after navigation. The visible title moves into the page (not the bar) so the focused heading is
  still the page's `h2`. The app name in the bar becomes a link, not the `h1`; each page's heading becomes `h1`
  (one per page), or the bar keeps a visually hidden `h1` — implementation detail, but there must be exactly one `h1`.

## Account avatar and menu

### Initials

There is no photo upload, so the avatar shows initials, e.g. **EB** for "Ezekiel Baniaga".

Source of the name, in order:

1. `displayName` if the optional backend change below is done and the user set one.
2. Otherwise the `username` (decoded from the token today, or `GET /users/me`).

Algorithm (`src/ui/initials.ts`, unit tested):

```ts
/** "Ezekiel Baniaga" → "EB", "ezekiel.baniaga" → "EB", "zek" → "ZE", "admin" → "AD", "j" → "J". */
export function initials(name: string): string {
  const words = name
    .trim()
    // usernames allow [A-Za-z0-9._-]; split on those separators and on camelCase
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = (w: string) => Array.from(w); // code points, not UTF-16 units
  if (words.length === 0) return "?";
  if (words.length === 1) return letters(words[0]).slice(0, 2).join("").toUpperCase();
  return (letters(words[0])[0] + letters(words[words.length - 1])[0]).toUpperCase();
}
```

- First and last word, so "Mary Jane Watson" is MW.
- Digits are kept ("user42" → "US"; "42" → "42").
- Two characters max, so the circle never overflows.

### Avatar color

- The avatar uses one of the six pastel hues picked by a stable hash of the user's id (`unique_id`), not the username
  (a rename would change the color). Fill as background, ink as text.
- The signed-in user's own avatar in the top bar uses the **accent** instead, so it matches the theme they chose.
  Other users' avatars (admin screens) use the hash, which makes a list of users easy to scan.

### Menu

```
           ( EB ) ◄─ button: aria-label "Account menu for ezekiel.baniaga"
  ┌──────────────────────────────┐
  │ (EB)  ezekiel.baniaga        │
  │       ADMIN · since Oct 2026 │
  ├──────────────────────────────┤
  │ ◯  Profile                   │
  │ ▣  Your devices              │
  │ ⛨  Admin                     │  only for ADMIN tokens (server still checks)
  ├──────────────────────────────┤
  │ APPEARANCE                   │
  │ [ System | Light | Dark ]    │
  │ ● ● ● ● ● ●   accent swatches│
  ├──────────────────────────────┤
  │ ⎋  Sign out                  │
  └──────────────────────────────┘
```

- Replaces the "Signed in as ... (ROLE)" paragraph and the nav's Sign out button.
- Menu items are links/buttons; the appearance controls are a radio group and a swatch radio group inside the menu,
  so the menu is a **disclosure** (`aria-expanded` + a labelled region) rather than a strict ARIA `menu`, which may
  only contain menu items. Arrow-key roving is still provided for the link list.
- Sign out keeps today's behaviour (disable while signing out, `logout()` whatever the result).
- On phones the same content opens as a bottom sheet with a drag handle and a Close button.

## Screens

### Sign in and Create account

```
┌──────────────────────────────┐
│                              │
│        ● spendly             │
│   Track what you spend,      │
│   nothing more.              │
│  ┌────────────────────────┐  │
│  │ USERNAME               │  │
│  │ [                    ] │  │
│  │ PASSWORD          show │  │
│  │ [                    ] │  │
│  │ [      Sign in       ] │  │
│  └────────────────────────┘  │
│   No account? Create one     │
└──────────────────────────────┘
```

- Centered card on `--bg` with one or two soft accent-colored blobs in the background (CSS radial gradients, no images).
- Show/hide password toggle (`aria-pressed`, label "Show password").
- Create account shows the password rules as a short checklist under the field that ticks as you type
  (12+ characters, at most 72 bytes, not the username), reusing `registerSchema` rules. The server error codes
  (`USERNAME_TAKEN`, `INVALID_USERNAME`, `INVALID_PASSWORD`, 429 with `Retry-After`) map exactly as today.
- Theme follows the system setting here; the mode switch lives in the account menu after sign in.
- No change to the auth flow, the API calls or `AuthProvider`.

### Expenses (home)

Phone:

```
┌──────────────────────────────────────┐
│ ● spendly                    ( EB )  │
├──────────────────────────────────────┤
│ ╭──────────────────────────────────╮ │
│ │ THIS MONTH                       │ │
│ │ 1,284.50                         │ │  hero total (server)
│ │ 23 expenses                      │ │
│ │ ▇▇▇▇▇▇▇▇▇▇▅▅▅▅▅▃▃▃▂▂             │ │  category breakdown bar
│ │ ● Food 42%  ● Bills 31%  ...     │ │
│ ╰──────────────────────────────────╯ │
│ (This month)(Last month)(3M)(Year)(All) period chips
│ [⌕ Search descriptions        ] [⚙] │  search + Filters sheet
│ SORT  Date ▾ newest first            │
│                                      │
│ TODAY                                │
│ (🍴) Lunch with team        24.00    │
│      FOOD                            │
│ (🚌) Grab to office          8.50    │
│      TRANSPORT                       │
│ OCT 19 · SUN                         │
│ (🧾) Electricity           142.00    │
│      BILLS                           │
│        ‹ Prev  1 / 3  Next ›         │
├──────────────────────────────────────┤
│  ▤ EXPENSES   ▢ ARCHIVED   ◯ PROFILE │
└──────────────────────────────────────┘
```

Wide:

```
 Expenses                                              [+ Add expense]
 ┌────────────┐ ┌────────────┐ ┌──────────────────────────────────────┐
 │ THIS MONTH │ │ EXPENSES   │ │ BY CATEGORY                          │
 │ 1,284.50   │ │ 23         │ │ ▇▇▇▇▇▇▇▇▅▅▅▅▅▃▃▃▂▂                   │
 └────────────┘ └────────────┘ │ Food 540.20 · Bills 398.00 · ...     │
                               └──────────────────────────────────────┘
 [⌕ Search ]  CATEGORY (Food)(Transport)(Bills)(Fun)  FROM [   ] TO [   ]  Clear
 ┌──────────────────────────┬──────────────┬────────────┬────────────▲┐
 │ DESCRIPTION ↕            │ CATEGORY ↕   │ DATE ▼     │     AMOUNT ↕│
 ├──────────────────────────┼──────────────┼────────────┼─────────────┤
 │ Lunch with team          │ (Food)       │ Oct 21     │       24.00 │
 │ Grab to office           │ (Transport)  │ Oct 21     │        8.50 │
 └──────────────────────────┴──────────────┴────────────┴─────────────┘
 Page 1 of 3 · 23 expenses        [‹ Prev] [Next ›]   ROWS [20 ▾]
```

Details:

- **Summary** (hero card): total and count for the current filters, from the server (`total_amount` and `total`
  of the new list version, below). The category breakdown comes from the summary endpoint; it is a stacked bar of
  pastel segments with a text legend (amount and percent) underneath, so the numbers are readable without the bar.
  The bar has `role="img"` and an `aria-label` that lists the same numbers.
- **Period chips**: This month (default), Last month, Last 3 months, This year, All time, Custom (opens the date
  filter). They set `from`/`to`. "This month" is computed in the browser's local calendar, the same way `todayIso` is.
- **Search**: description contains, case-insensitive, debounced 300ms, applied server-side.
- **Filters**: category multi-select chips, date range, optional min/max amount, in a `.card` panel that is collapsed
  at every width. The default view is the Period chips, then the search box with a Filters button (filter icon) on the
  same row. The active filter count shows on the button ("Filters · 2"); while the panel is closed the active filters
  also show as removable chips under the search ("Food ×", "≥ 10.00 ×"). Custom opens the panel. A "Clear filters"
  link in the panel footer resets them.
- **All list state is in the URL** (`?q=&category=FOOD&category=BILLS&from=&to=&sort=date,desc&page=0&size=20`), like
  `AdminUsersPage`, so reload, back/forward and shared links keep it. Invalid values fall back to defaults with a
  notice, as `INVALID_PAGE` does today.
- **Rows on phones** are cards: category icon in its color, description (one line, ellipsis, full text in the
  detail), category caps label, amount right-aligned in `--fs-md`. The whole row is the link (one tap target), with
  the description as the link text so the accessible name stays the description (tests find links by it today).
- **Grouping by day** (TODAY / YESTERDAY / OCT 19 · SUN) only when sorted by date; other sorts show a flat list. Day
  headers are `h3` inside the list section.
- **Wide screens** keep a real `<table>` with sortable headers (see [Sorting](#sorting)); amounts right-aligned.
- **Paging**: numbered pages with Prev/Next and a size select on every screen size (decided: no "Load more", since
  phone and wide share one markup).
- **Empty states**: no expenses at all ("Nothing here yet. Add your first expense and it shows up here." + Add
  button); no matches for filters ("No expenses match these filters." + Clear filters).
- **Loading**: skeleton rows; keep a visually hidden `role="status"` text.
- **Errors**: as today (toast + inline Retry), restyled.

### Add expense

Lemonade-style: one focused card, the amount first and big, quick choices as chips. Still one form and one POST.

```
┌──────────────────────────────────────┐
│ ←  New expense                       │
├──────────────────────────────────────┤
│               AMOUNT                 │
│            ₱ 0.00                    │  big, autofocus on wide screens only
│                                      │
│ WHAT WAS IT FOR?                     │
│ [ Lunch with team                ]   │
│                                      │
│ CATEGORY                             │
│ (🍴 Food) (🚌 Transport)              │
│ (🧾 Bills) (🎟 Entertainment)         │
│                                      │
│ WHEN                                 │
│ (Today) (Yesterday) (📅 Pick a date)  │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │          Add expense             │ │  sticky above keyboard / tab bar
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

- Same fields, rules and error mapping as `ExpenseFields` + `expenseSchema` (description ≤ 250, amount > 0 with ≤ 8
  integer and 2 decimal digits, category required, date not in the future). Categories still come from
  `GET /api/expense/categories`.
- Category becomes a radio chip group instead of a `<select>`; Date becomes Today / Yesterday chips plus a native date
  input for other days (`max` today, as now).
- After a successful add: on phones go back to the list with a success toast "Added Lunch with team · 24.00" and the
  new row highlighted briefly; on wide screens the same. (Today it navigates to the new expense's detail page;
  changing this is an open decision.)
- "Add another" checkbox on wide screens keeps the form open and clears it after a save, for quick entry.
- On phones the page is a full-screen route (`/expenses/new`, deep-linkable as today), styled like a sheet.
- `PageHeading` focus behaviour is unchanged; the amount gets focus only on wide screens (focusing on phones opens the
  keyboard over the form).

### Expense detail and edit

```
┌──────────────────────────────────────┐
│ ←                                    │
├──────────────────────────────────────┤
│   (🍴)                               │
│   Lunch with team                    │
│   24.00                              │  --fs-xl
│   (Food) · Tue, Oct 21 2026          │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ CREATED        Oct 21, 09:05     │ │
│ │ LAST MODIFIED  Never             │ │
│ │ ▸ Technical details (collapsed)  │ │
│ └──────────────────────────────────┘ │
│ [           Edit expense           ] │
└──────────────────────────────────────┘
```

- Amount, description, category and date are the visible content; Created / Last modified / Version / Id move to a
  muted "Details" card (Id shortened with a copy button and the full value as accessible text, under "Technical details").
- **Edit** opens the same form as Add, prefilled (in place on the page, as today, or as a sheet); PUT with `version`.
- Version and Id sit in a collapsed "Technical details" block (Copy is a small ghost button). The category shows once,
  as the chip. Edit is the primary button and Delete a danger-colored ghost; there is no separate "Edit description".
- **Delete** opens a confirm `Dialog` ("Delete this expense? It moves to Archived and is removed for good after the
  retention period.") with Cancel focused first; DELETE with `?version=`. Success toast "Expense deleted".
- All existing 409 handling stays: `CONCURRENT_MODIFICATION` keeps the input and shows a Reload banner;
  `MODIFY_ARCHIVED` says it was deleted and returns to the list; 404/400 show "Not found" without revealing existence.
- Timestamps are shown in the browser's local time with the date written out (`Intl.DateTimeFormat`), converting from
  the API's UTC-without-offset strings (append `Z` before parsing). Today they are shown as raw UTC text.

### Archived

- Same row style as the list but muted (no category color fill, a small archive icon), plus "Archived Oct 18".
- Sortable by description, amount and archived date in the browser: the list is small and bounded by the cleanup job,
  and sorting does not compute money. Default newest archived first (as today). Or use the paged version below if it
  is added; open decision.
- A one-line note at the top: "Deleted expenses stay here for 30 days, then are removed." (the retention is the
  constant `RETENTION_MAX_DAYS = 30` in `expense/job/ExpenseCleanup.java`, not a setting).
- Read only, as today (there is no restore endpoint).

### Profile

Cards, top to bottom:

1. **Account**: a header row with the large avatar (80px) and the username with "Member since Oct 2026", then a
   `dl` with Name (Edit as a small ghost button) and Role as the role chip.
2. **Appearance**: the display currency. Theme mode and accent live in the account menu only, not here.
3. **Security**: a `.note` callout warning that changing the password signs you out everywhere, then the change
   password form (current and new password as `PasswordField` with show/hide). Success still signs out everywhere
   and goes to `/login`.
4. **Your devices**: a divider list, one row per session: the device line parsed from the User-Agent ("Firefox on
   Linux", "Safari on iPhone", falling back to the raw string) with a "This device" status chip, one muted line
   "10.0.0.1 · active 5 min ago · expires Oct 31, 2026" with the full times in `title`, and Revoke as a small ghost
   button on the right. Revoke and "Sign out other devices" keep their inline confirms.

`/me#devices` anchors the devices card so the account menu can link straight to it. Today the section has no
`id` (only `aria-labelledby="devices-heading"`) and React Router does not scroll to a hash, so add `id="devices"` and
scroll/focus to it in `ProfilePage`.

### Admin

- **Users**: avatar + username, role chip (Admin in accent, User neutral), status chip (Enabled mint / Disabled
  neutral with a strike-through icon), created date. Sortable headers once the backend accepts `sort` (below). Filters
  (username search, status chips) stay in the URL as today.
- **User detail**: header card like Profile; role and enabled toggles with the existing inline confirm before disable
  or demote; 403 "You no longer have admin access" banner unchanged.
- An "Admin" pill in the top bar on admin pages so it is obvious you are acting on other users.

### Errors, 404 and the error boundary

- `ErrorBoundary` fallback becomes an `EmptyState` with a neutral illustration, "Something went wrong", and
  "Back to expenses".
- Unknown routes still redirect to `/` (no separate 404 page needed).

## Sorting

### Table headers

```html
<th aria-sort="descending">
  <button type="button" class="sort-header">
    Date <SortIcon dir="desc" aria-hidden="true" />
  </button>
</th>
```

- Only the active column has `aria-sort` (`ascending`/`descending`); others have none.
- Click cycles: first click sorts by that column in its natural direction (date and amount descending, text
  ascending), second click flips, the column never goes "unsorted" (there is always a server order).
- The button's accessible name is just the column name; a visually hidden live region announces
  "Sorted by amount, highest first".
- On phones there are no column headers; a "Sort" select or sheet offers the same choices:
  Newest / Oldest / Highest amount / Lowest amount / Description A–Z / Z–A / Category.

### Where sorting happens

| List | Where | Why |
| --- | --- | --- |
| Expenses | Server (`sort` param) | Paged; a client sort would only sort the current page. |
| Archived | Browser (or server if the paged version is added) | Small, bounded, already loaded whole. |
| Admin users | Server (`sort` param, new) | Paged. |
| Your devices | Browser | At most 10 sessions (`app.session.max-active`). |

Every server sort adds a unique tie-breaker (`created_at desc, id desc` for expenses, `id` for users, as
`listUsers` does) so rows never jump between pages.

## Preferences

Stored per browser in `localStorage`, read and written inside `try/catch`, with safe defaults when storage is
unavailable. None of these go to the server (they are display conveniences and the backend has no settings table).

| Key | Values | Default |
| --- | --- | --- |
| `ui.theme` | `system`, `light`, `dark` | `system` |
| `ui.accent` | `rose`, `peach`, `lemon`, `mint`, `sky`, `lavender` | `lavender` |
| `ui.currency` | empty or an ISO 4217 code (`PHP`, `USD`, ...) | empty (no symbol) |
| `ui.density` | `comfortable`, `compact` | `comfortable` |
| `ui.pageSize` | 10, 20, 50, 100 | 20 |

- **Currency** is display only: amounts are formatted with `Intl.NumberFormat(locale, { style: "currency", currency })`
  when set, otherwise with grouping and two decimals (`1,284.50`). Amounts are stored without currency, so changing
  this never changes data; the setting says so ("Only changes how amounts look").
- **Compact density** shrinks row padding for desktop users who want more rows on screen; tap targets stay 44px on
  touch devices regardless.
- A `usePreferences()` hook exposes these, and `main.tsx` applies theme and accent before the first render.

## Backend changes

Only what the UI needs. None of them touch `auth/`, `session/`, `SecurityConfig`, tokens, password handling or rate
limits. Each is a separate, testable step.

### 1. Expense list version 1.3: filter, sort, page

`GET /api/expense` with `X-API-Version: 1.3`. Versions 1.0–1.2 stay unchanged.

Query parameters, all optional:

| Param | Type | Meaning |
| --- | --- | --- |
| `q` | string, ≤ 100 chars | Description contains, case-insensitive; LIKE wildcards literal (reuse `escapeLike` from `UserService`, moved to `common/`) |
| `category` | repeatable, bound as strings | Any of the given categories, case-insensitive; unknown value → 400 `INVALID_CATEGORY`. Today that code comes only from request bodies (`ExpenseMapper.parseCategory`); binding `List<Category>` would give `VALIDATION_ERROR`, so parse the strings with the same rule |
| `from`, `to` | `YYYY-MM-DD` | Inclusive expense-date range; `from > to` → 400 `INVALID_DATE_RANGE` |
| `minAmount`, `maxAmount` | decimal | Inclusive amount range; min > max → 400 `INVALID_AMOUNT_RANGE` |
| `sort` | `field,dir` | `date` (default, `desc`), `amount`, `description`, `category`, `createdAt`; dir `asc`/`desc`; unknown → 400 `INVALID_SORT` |
| `page` | int ≥ 0 | Default 0 |
| `size` | 1–100 | Default 20; out of range → 400 `INVALID_PAGE` (same code and message style as users) |

Response:

```json
{
  "expenses": [ { "id": "…", "description": "…", "amount": 24.00, "category": "FOOD", "date": "2026-10-21", "version": 0 } ],
  "page": 0,
  "size": 20,
  "total": 23,
  "total_pages": 2,
  "total_amount": 1284.50
}
```

- Items are the 1.2 item shape (`ExpenseListItemResponseV1_2`), so the frontend mapping barely changes.
- `total` and `total_amount` cover **all rows matching the filters**, not just the page (the hero card shows them).
  `total_amount` is a `SUM` in SQL, skipping null amounts as 1.1/1.2 do.
- Legacy rows with null date/amount/category/description sort last in either direction (`NULLS LAST`), matching
  1.2's `nullsLast`. A null-category row never matches a `category` filter; a null-amount row never matches an
  amount range.
- Paging fields use camelCase or snake_case consistently with the rest of the expense API: the list wrapper already
  uses `total_amount`, so `total_pages` here; this is an open decision because `UserListResponse` uses `totalPages`.
- Implementation: `ExpenseRepository extends JpaSpecificationExecutor<Expense>`, a `Specification` built like
  `UserService.listUsers` (owner, not archived, filters), `PageRequest` with a `Sort` that always ends in
  `createdAt desc, id desc`, plus a separate `SUM(amount)` query with the same specification (a small custom
  repository method using `CriteriaBuilder`). Scoped to the owner exactly like today.
- No new index (decided): `index_expense_owner_id` (V9) is enough at this app's scale. A partial index with
  `WHERE archived IS NOT TRUE` would not be implied by today's `archived IS NULL OR archived = FALSE` predicate anyway.
- Register `"1.3"` in `config/WebMVCConfig` (`addSupportedVersions` lists only 1.0–1.2) and update
  `ExpenseApiVersionTests`, which asserts 1.3 is rejected. Don't use a Spring Data `Pageable` argument: it would read
  `sort=date,desc` as an entity property; use plain `@RequestParam`s as `AdminUserController.list` does.
- Malformed values (`from=2026-13-01`, `page=abc`) and `q` over 100 characters answer 400 `VALIDATION_ERROR` (decided).
- Tests (`@SpringBootTest` + Testcontainers): each filter, each sort and direction, null rows last, totals over the
  whole filtered set, paging boundaries, every 400 code, and another user's expenses never appearing.
- README API section and the version table get the new version.

### 2. Expense summary

`GET /api/expense/summary?from=&to=` (`X-API-Version: 1.0+`; same date validation as above).

```json
{
  "from": "2026-10-01",
  "to": "2026-10-31",
  "count": 23,
  "total_amount": 1284.50,
  "by_category": [
    { "category": "FOOD", "count": 11, "total_amount": 540.20 },
    { "category": "BILLS", "count": 3, "total_amount": 398.00 }
  ]
}
```

- Active (not archived) expenses of the caller, `GROUP BY category`, null category reported as `null` (shown as
  "Uncategorized"), ordered by total descending.
- Optional later: `by_month` (`date_trunc('month', expense_date)`) for a "last 6 months" mini bar chart on wide screens.
  Not needed for the first version.
- Why not reuse the list: the breakdown needs every row in the range, and the browser must not sum amounts.

### 3. Admin user list sort

Add `sort` to `GET /users` with fields `createdAt` (default, `asc` as today), `username`, `role`, `enabled`, always
ending in `id`. Same 400 `INVALID_SORT`. Touches `AdminUserController.list` and `UserService.listUsers` only, not
the admin permission checks around them.

### 4. Archived list paging and sort (optional)

`GET /api/expense/archived` with `X-API-Version: 1.1`: `sort` (`archivedAt` default desc, `amount`, `description`),
`page`, `size`, response with paging fields. Only worth it if archived lists grow large; with the retention cleanup,
the browser sort is enough. Recommendation: **skip** for now.

### 5. Display name (optional)

For better initials ("EB" from "Ezekiel Baniaga" instead of "EZ" from "zek").

- Migration V17 (the next free number, since list 1.3 adds no index): `ALTER TABLE users ADD COLUMN display_name
  VARCHAR(100);` nullable.
- `UserResponse` and `AdminUserResponse` gain `displayName` (null when unset).
- `PATCH /users/me` with `{ "displayName": "Ezekiel Baniaga" }`: trimmed, 1–100 characters, no control
  characters, empty string clears it; 400 `INVALID_DISPLAY_NAME`. No optimistic locking (decided): only the owner
  edits it. `UserResponse` is also the `POST /auth/register` body, which gains the (null) field.
- Not in the access token: the UI reads it from `GET /users/me` (cached by TanStack Query under `["me"]`) and falls
  back to the username until it loads. No change to `JWTService`, login or refresh.
- Registration does not ask for it (keeps the auth flow untouched); Profile offers "Add your name".

### What stays untouched

`auth/**`, `session/**`, `SecurityConfig`, `JWTAuthenticationFilter`, rate limiters, `PasswordValidator`,
`UsernameValidator`, `/auth/*` endpoints and the refresh-token cookie handling. The nginx CSP stays as strict as it is.

## Frontend architecture

### Files

```
frontend/src/
  assets/fonts/            JetBrainsMono-{Regular,Medium,Bold}.woff2, OFL.txt
  styles/
    tokens.css             colors (light/dark/accents/categories), type, spacing, radius, shadow, motion
    base.css               reset, body, typography, focus ring, skip link, reduced motion
    components.css         button, field, chip, card, table, menu, sheet, toast, skeleton ...
    layout.css             top bar, tab bar, page container, breakpoints
  ui/
    theme.ts               read/apply theme + accent (used by main.tsx and the menu)
    preferences.tsx        PreferencesProvider + usePreferences
    initials.ts            initials() + hue hash
    icons.tsx              inline SVG icons
    Avatar.tsx  Button.tsx  Chip.tsx  Card.tsx  Menu.tsx  Sheet.tsx  Dialog.tsx
    SortableHeader.tsx  Pagination.tsx  EmptyState.tsx  Skeleton.tsx
    Layout.tsx  TopBar.tsx  TabBar.tsx  AccountMenu.tsx
    Toast.tsx  forms.tsx  focus.tsx  ErrorBoundary.tsx   (existing, restyled/extended)
  expenses/
    listParams.ts          URL <-> list filters/sort/page, validated
    ExpenseSummary.tsx  ExpenseFilters.tsx  ExpenseRows.tsx (cards) ExpenseTable.tsx (wide)
    ...existing pages
  format/
    money.ts               formatMoney(amount, currency, locale)
    dates.ts               formatDay, formatRelativeDay, parseUtc, formatLocalDateTime
```

- **Plain CSS with custom properties**, split into a few files imported once from `main.tsx`, class names prefixed
  by component (`.btn`, `.btn--primary`). No CSS modules needed at this size; switch to CSS modules only if names
  start colliding. No new runtime dependencies.
- **Breakpoints**: `48rem` (tab bar → top nav, cards → table), `64rem` (summary cards in a row). Container queries
  (`@container`) for the summary card, so it adapts when embedded elsewhere.
- **Layout** keeps `RequireAuth` around it and `Outlet` inside the `ErrorBoundary`.
- `formatAmount` stays for places that need the plain `"24.00"` (forms); display uses `formatMoney`.

### Data

- The list query key becomes `["expenses", params]` with `placeholderData: (previous) => previous` (as the admin list
  does) so the table does not blank while the next page or sort loads. Mutations keep invalidating `["expenses"]`,
  which matches every params variant.
- Summary key `["expenses", "summary", { from, to }]`, invalidated by the same prefix after create, update, delete.
- No `useInfiniteQuery`: numbered pages on every size (decided).
- `useMe()` hook for `GET /users/me` (avatar name, member since), shared by the menu and Profile.

## Accessibility

Everything in the existing accessibility pass stays. Additions:

- **Contrast test instead of axe's `color-contrast`**: jsdom cannot compute colors, so a Vitest test parses
  `tokens.css`, resolves each documented text/background pair (ink on bg, muted on surface, every pastel ink on its
  fill, primary text on primary background, in light and dark), and asserts ≥ 4.5:1 (≥ 3:1 for focus rings, borders
  of inputs and icons). A palette change that breaks contrast fails the build.
- **Playwright axe run with contrast on**: `@axe-core/playwright` (dev dependency) against the E2E stack in light
  and dark (`page.emulateMedia({ colorScheme })`), every main screen, at 360px and 1280px.
- **Focus ring**: 2px `--focus-ring` with 2px offset, plus a 4px translucent halo, visible on every surface in both
  modes. Never removed except on programmatically focused headings (as today).
- **Tap targets** ≥ 44×44 px; chips and small buttons extend their hit area with padding.
- **Small text** is only used for non-essential metadata or caps labels at weight 500; body text is 13px minimum and
  scales with browser zoom up to 200% without horizontal scrolling (rem units, wrapping layouts).
- **Caps via CSS** (`text-transform`), so screen readers read words, not letters.
- **Menus, sheets and dialogs**: native `<dialog>` for modal ones; Escape closes; focus moves in and returns to the
  opener (same principle as `useRefocusOnClose`); background `inert` while a sheet is open.
- **Sorting** announced through `aria-sort` and a polite live region.
- **Color never alone**: category chips have icon + text; error fields have icon + text + border; status chips have text.
- **Reduced motion** respected everywhere.
- **Windows High Contrast / forced colors**: `@media (forced-colors: active)` keeps borders on chips, cards and
  buttons (pastel fills disappear in that mode) and uses `Highlight` for the selected state.

## Performance and security

- Fonts: three woff2 files, `<link rel="preload" as="font" crossorigin>` for Regular only (via Vite's `index.html`
  processing so the hashed name is used), the rest load on use. Served from `/assets/` with the existing immutable
  cache header.
- CSS stays under ~25 KB unminified. Icons are inline components (tree-shaken).
- No new runtime dependencies; dev only: `@axe-core/playwright`.
- CSP unchanged: everything is same-origin, no inline scripts, no `data:` URIs (`assetsInlineLimit: 0`), React's style
  props are applied through the DOM API, which `style-src 'self'` does not block.
- No user-controlled values go into CSS (avatar colors come from a fixed palette by index, not from the name).
- Display name, if added, is rendered as text only (React escapes it), never in `dangerouslySetInnerHTML` or a URL.

## Testing

- **Unit (Vitest)**: `initials`, hue hash, `formatMoney`, date helpers (UTC parsing, relative days across midnight
  and DST), `listParams` (URL ↔ params round trip, invalid values), theme read/apply with throwing storage, contrast test.
- **Component (Testing Library + MSW)**: account menu (open, arrow keys, Escape returns focus, admin item only for
  admins, theme switch sets `data-theme`), sortable header (`aria-sort`, cycle order, URL updates, request has `sort`),
  filters (URL and request params), pagination and load more, add-expense chips submit the same body as today,
  delete dialog, success toasts.
- **Existing tests** keep querying by role and accessible name. Expected breakage to fix alongside each step: the nav
  "Sign out" button moves into the account menu (tests open the menu first), "Signed in as" text disappears,
  `<select>` for category becomes radio chips (`getByRole("radio", { name: "Food" })`), the inline delete confirm
  becomes a dialog, the list request now sends version 1.3.
- **a11y.test.tsx** keeps running axe on every screen (contrast off there; covered by the token test and Playwright).
- **Backend**: integration tests per new parameter and endpoint, as listed under each change.
- **E2E (Playwright)**: update selectors in `frontend/e2e/*.spec.ts`; add one spec for sort + filter + paging through
  the real API, and one visual smoke run at 360px and 1280px in both color schemes (screenshots stored as test
  artifacts, not as baselines, to avoid flaky pixel diffs).
- **Manual**: a real phone (iOS Safari and Android Chrome): no zoom on input focus, the tab bar clears the home
  indicator, the keyboard does not hide the Add button, dark mode follows the OS.

## Implementation plan

Ordered so each step is one commit, keeps tests green, and leaves the app usable. Steps 1–6 are frontend only.

1. **Tokens and font.** Add `styles/tokens.css`, `base.css`, the JetBrains Mono woff2 files with `OFL.txt`,
   `@font-face`, `assetsInlineLimit: 0`, the theme/accent bootstrap in `main.tsx`, `color-scheme`, `theme-color`
   metas. Restyle native elements (buttons, inputs, tables, links) through tokens only. Token contrast test.
2. **Core components.** `Button`, `IconButton`, fields, `Chip`/`ChipGroup`, `SegmentedControl`, `Card`, `Skeleton`,
   `EmptyState`, icons. Swap them into existing pages without changing behaviour.
3. **App shell.** `TopBar`, `TabBar` (phones), top nav (wide), `Avatar` + `initials`, `AccountMenu` with Profile,
   Your devices, Admin, appearance controls and Sign out; `PreferencesProvider`. Update tests for the moved Sign out.
4. **Toasts and dialogs.** `showSuccess`, toast placement; `Dialog`/`Sheet`; delete confirm becomes a dialog; success
   toasts for add, save, delete, revoke.
5. **Screen restyles.** Login/register (card, show password, rules checklist), expense detail (hero layout, inline
   description edit, details card, local time), add/edit form (amount first, category and date chips), profile cards
   and device names, archived (muted rows, browser sorting), admin restyle.
6. **Formatting.** `formatMoney` with optional currency preference, `dates.ts` local-time formatting everywhere.
7. **Backend: expense list 1.3** (filter, sort, page, filtered `total_amount`), no new index, tests, README.
8. **Backend: expense summary** endpoint, tests, README.
9. **Frontend: list 1.3.** `listParams` in the URL, sortable table (wide), sort select (phones), search, filters
   sheet, period chips, pagination and load more, day grouping, empty and no-match states.
10. **Frontend: summary card.** Hero total, category breakdown bar with text legend.
11. **Backend + frontend: admin user sort.** `sort` param, sortable headers on `/admin/users`.
12. **Display name.** V17, `UserResponse.displayName`, `PATCH /users/me`, Profile edit, initials from it.
13. **E2E and docs.** Playwright updates, axe with contrast in both schemes, README Web UI section (screens, preferences,
    new API version), this proposal marked done.

## Open decisions

All settled on 2026-10-21:

- [x] **App name**: keep "Expense Tracker" ("spendly" in the sketches is only a placeholder).
- [x] **Typeface**: JetBrains Mono everywhere.
- [x] **Font source**: Latin-subset woff2 and OFL copied from `@fontsource/jetbrains-mono`.
- [x] **Default accent**: Lavender.
- [x] **Add button on phones**: floating action button.
- [x] **After adding an expense**: back to the list with a success toast.
- [x] **Phone vs wide**: CSS only, one markup for every size. No "Load more" (numbered pages everywhere), filters in a
      disclosure instead of a sheet, no amount autofocus; a sort select shown by CSS on phones.
- [x] **Headings**: each page's `PageHeading` is the one `h1`; the bar's app name is a link.
- [x] **Display name**: yes, `PATCH /users/me` without optimistic locking; migration V17.
- [x] **Paging field naming in list 1.3**: `total_pages`.
- [x] **List 1.3 index**: none.
- [x] **Malformed list params and long `q`**: 400 `VALIDATION_ERROR`; only semantic errors get their own codes.
- [x] **Dialogs**: only the expense delete confirm; profile and admin confirms stay inline.
- [x] **Summary `from`/`to`**: optional; absent means all time, echoed as `null`.
- [x] **Number locale**: the browser's locale; tests and E2E pin `en-US` and `TZ=UTC`.
- [x] **Archived paging**: skipped; the browser sorts.
- [x] **Currency preference**: browser-only display setting.
- [x] **Summary `by_month`**: later.
- [x] **Keyboard shortcuts**: later.

## Out of scope, worth a later proposal

- Restore from archive (needs an endpoint and a rule for version/`archived_at`).
- Custom categories, budgets per category with progress bars (would suit the pastel chips well), recurring expenses,
  receipt photos, CSV export, multi-currency amounts.
- Server-stored preferences, so theme and accent follow the user across devices.
- PWA install with an app icon and offline read-only list.
- Email and password reset (needs email on users; touches auth, so separate).

## Appendix A: token sketch

```css
:root {
  /* pastel hues: fill / ink / strong (light) */
  --rose-fill: #FFE1EC;     --rose-ink: #8C2251;     --rose-strong: #C93D74;
  --peach-fill: #FFE6D5;    --peach-ink: #8A3B12;    --peach-strong: #B5531F;
  --lemon-fill: #FFF4C2;    --lemon-ink: #6B5300;    --lemon-strong: #8A6D00;
  --mint-fill: #D9F5E6;     --mint-ink: #1C6440;     --mint-strong: #25804F;
  --sky-fill: #DCEEFF;      --sky-ink: #1D5486;      --sky-strong: #2A6CB0;
  --lavender-fill: #E9E2FF; --lavender-ink: #4F3A9E; --lavender-strong: #6A52C7;

  --bg: #FAF8F5; --surface: #FFFFFF; --surface-2: #F3F0EC; --line: #E7E3EC;
  --ink: #24212F; --muted: #625E73;
  --danger: #B3261E; --danger-fill: #FCE8E6; --success: #1C6440;

  --font: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --fs-caps: 0.65625rem; --fs-sm: 0.75rem; --fs-base: 0.8125rem;
  --fs-md: 0.9375rem; --fs-lg: 1.125rem; --fs-xl: 1.75rem;
  --fs-input: var(--fs-base);

  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;
  --r-sm: 6px; --r-md: 12px; --r-lg: 20px; --r-full: 999px;
  --shadow-1: 0 1px 2px rgb(36 33 47 / 6%), 0 4px 12px rgb(36 33 47 / 6%);
  --shadow-2: 0 8px 32px rgb(36 33 47 / 14%);
  --dur-fast: 120ms; --dur: 200ms; --dur-slow: 280ms; --ease: cubic-bezier(.2, .8, .2, 1);
  color-scheme: light;
}

@media (pointer: coarse) {
  :root { --fs-input: 1rem; } /* iOS zooms into inputs under 16px */
}

/* dark: same names, deep fills and light pastel inks; strong = ink in dark */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* ...dark values... */ }
}
:root[data-theme="dark"] {
  --bg: #14131A; --surface: #1C1B24; --surface-2: #24232E; --line: #2E2C3A;
  --ink: #ECE9F5; --muted: #A6A2B8;
  --danger: #FFB4AB; --danger-fill: #3B1D1B; --success: #9FE3C1;
  --rose-fill: #3A1E2B; --rose-ink: #FFB3CF; --rose-strong: #FFB3CF;
  /* ...other hues... */
  color-scheme: dark;
}

.caps {
  font-size: var(--fs-caps);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
```

Plain CSS cannot share one block between a media query and an attribute selector, so the dark values appear twice
(in the media query and in `:root[data-theme="dark"]`). The contrast test reads both blocks and fails if they differ,
so they cannot drift apart.

## Appendix B: list URL grammar

```
/?q=lunch&category=FOOD&category=TRANSPORT&from=2026-10-01&to=2026-10-31&sort=amount,desc&page=1&size=20
```

- Omitted params use defaults (no filters, `sort=date,desc`, `page=0`, `size` from preferences or 20).
- The period chips write `from`/`to`; "All time" removes both.
- Changing any filter or sort resets `page` (as `AdminUsersPage.update` does).
- `listParams.ts` validates before sending; whatever the server still rejects (400 `INVALID_*`) resets that param
  with a notice.

## Appendix C: microcopy

| Place | Text |
| --- | --- |
| Empty list | "Nothing here yet." / "Add your first expense and it shows up here." / [Add expense] |
| No matches | "No expenses match these filters." / [Clear filters] |
| Empty archived | "Nothing archived. Deleted expenses wait here for a while." |
| Added | "Added Lunch with team · 24.00" |
| Saved | "Saved" |
| Deleted | "Expense deleted. It's in Archived for now." |
| Delete confirm | "Delete this expense?" / "It moves to Archived and is removed for good later." / [Cancel] [Delete] |
| Stale version | "This expense changed somewhere else. Reload to see the latest; your input is kept." / [Reload] |
| Sign in subtitle | "Track what you spend, nothing more." |
| Password changed | "Password changed. Sign in again on every device." |
| Session revoked | "Signed out of Firefox on Linux." |
| Currency hint | "Only changes how amounts look. Amounts are saved as numbers." |
