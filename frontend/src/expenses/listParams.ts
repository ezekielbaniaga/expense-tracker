import { CATEGORY_LABELS, todayIso, type Category } from "../api/expense";

export const DEFAULT_SORT = "date,desc";

export interface ListParams {
  q: string;
  category: Category[];
  /** YYYY-MM-DD or "" for no bound. */
  from: string;
  to: string;
  /** A decimal number as typed, or "" for no bound. */
  minAmount: string;
  maxAmount: string;
  sort: string;
  /** Zero-based. */
  page: number;
  size: number;
}

/** The names of the filter params; changing one of them resets the page. */
export const LIST_PARAM_NAMES = [
  "q",
  "category",
  "from",
  "to",
  "minAmount",
  "maxAmount",
  "sort",
  "page",
  "size",
  "period",
] as const;

export type Period = "month" | "last-month" | "3-months" | "year" | "all" | "custom";

/** The chips in display order; "custom" has no range of its own. */
export const PERIOD_CHIPS: { value: Period; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "3-months", label: "Last 3 months" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

/**
 * The from/to of a period in the local calendar (never toISOString, which is UTC).
 * Periods that include the present end today; "last month" ends on its last day.
 * "Last 3 months" is this month and the two before it.
 */
export function periodRange(period: Exclude<Period, "custom">, now: Date = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (year: number, month: number, day: number) => todayIso(new Date(year, month, day));
  switch (period) {
    case "month":
      return { from: iso(y, m, 1), to: todayIso(now) };
    case "last-month":
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "3-months":
      return { from: iso(y, m - 2, 1), to: todayIso(now) };
    case "year":
      return { from: iso(y, 0, 1), to: todayIso(now) };
    case "all":
      return { from: "", to: "" };
  }
}

/** Which chip the from/to pair is: a preset when it matches one exactly, else custom. */
export function detectPeriod(from: string, to: string, now: Date = new Date()): Period {
  for (const chip of PERIOD_CHIPS) {
    if (chip.value === "custom") continue;
    const r = periodRange(chip.value, now);
    if (r.from === from && r.to === to) return chip.value;
  }
  return "custom";
}

const SORT_PATTERN = /^(date|amount|description|category|createdAt),(asc|desc)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

function validDate(value: string | null): string {
  return value !== null && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value)) ? value : "";
}

function validAmount(value: string | null): string {
  return value !== null && AMOUNT_PATTERN.test(value) ? value : "";
}

function nonNegativeInt(value: string | null, fallback: number): number {
  return value !== null && /^\d+$/.test(value) ? Number(value) : fallback;
}

/** The backend rejects a longer q with 400 VALIDATION_ERROR (Java String length, like JS: UTF-16 units). */
export const MAX_SEARCH_LENGTH = 100;

/** Cuts q to the limit without leaving half of a surrogate pair at the end. */
function cutSearch(value: string): string {
  if (value.length <= MAX_SEARCH_LENGTH) return value;
  const cut = value.slice(0, MAX_SEARCH_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * Reads the list state from the URL. A value that could not be sent (a bad date,
 * an unknown category) is dropped, so a hand-edited link still loads.
 */
export function readListParams(
  params: URLSearchParams,
  defaultSize: number,
  now: Date = new Date(),
): ListParams {
  const size = nonNegativeInt(params.get("size"), defaultSize);
  const sort = params.get("sort");
  let from = validDate(params.get("from"));
  let to = validDate(params.get("to"));
  // No dates in the URL means This month, unless period=all asks for no bounds
  if (from === "" && to === "" && params.get("period") !== "all") ({ from, to } = periodRange("month", now));
  return {
    q: cutSearch(params.get("q") ?? ""),
    category: [...new Set(params.getAll("category"))].filter((c): c is Category => c in CATEGORY_LABELS),
    from,
    to,
    minAmount: validAmount(params.get("minAmount")),
    maxAmount: validAmount(params.get("maxAmount")),
    sort: sort !== null && SORT_PATTERN.test(sort) ? sort : DEFAULT_SORT,
    page: nonNegativeInt(params.get("page"), 0),
    size: size >= 1 ? size : defaultSize,
  };
}

/** The URL form: defaults and empty filters are left out. */
export function toSearchParams(p: ListParams, defaultSize: number, now: Date = new Date()): URLSearchParams {
  const out = new URLSearchParams();
  if (p.q.trim() !== "") out.set("q", p.q.trim());
  for (const c of p.category) out.append("category", c);
  if (p.from === "" && p.to === "") out.set("period", "all");
  else if (detectPeriod(p.from, p.to, now) !== "month") {
    if (p.from !== "") out.set("from", p.from);
    if (p.to !== "") out.set("to", p.to);
  }
  if (p.minAmount !== "") out.set("minAmount", p.minAmount);
  if (p.maxAmount !== "") out.set("maxAmount", p.maxAmount);
  if (p.sort !== DEFAULT_SORT) out.set("sort", p.sort);
  if (p.page !== 0) out.set("page", String(p.page));
  if (p.size !== defaultSize) out.set("size", String(p.size));
  return out;
}

/** The query string for `GET /api/expense` version 1.3; page, size and sort are always sent. */
export function toApiQuery(p: ListParams): string {
  const out = new URLSearchParams();
  out.set("page", String(p.page));
  out.set("size", String(p.size));
  out.set("sort", p.sort);
  if (p.q.trim() !== "") out.set("q", p.q.trim());
  for (const c of p.category) out.append("category", c);
  if (p.from !== "") out.set("from", p.from);
  if (p.to !== "") out.set("to", p.to);
  if (p.minAmount !== "") out.set("minAmount", p.minAmount);
  if (p.maxAmount !== "") out.set("maxAmount", p.maxAmount);
  return out.toString();
}

/** The filters `GET /api/expense/summary` takes: the list's filters without paging and sorting. */
export function summaryFilters(p: ListParams) {
  return { from: p.from, to: p.to, q: p.q.trim(), category: p.category, minAmount: p.minAmount, maxAmount: p.maxAmount };
}

/** The query string for `GET /api/expense/summary`; empty filters are left out. */
export function toSummaryQuery(p: ListParams): string {
  const f = summaryFilters(p);
  const out = new URLSearchParams();
  if (f.q !== "") out.set("q", f.q);
  for (const c of f.category) out.append("category", c);
  if (f.from !== "") out.set("from", f.from);
  if (f.to !== "") out.set("to", f.to);
  if (f.minAmount !== "") out.set("minAmount", f.minAmount);
  if (f.maxAmount !== "") out.set("maxAmount", f.maxAmount);
  return out.toString();
}

/** Which params a 400 code refers to, so just those go back to their defaults. */
export const INVALID_CODE_PARAMS: Record<string, string[]> = {
  INVALID_PAGE: ["page", "size"],
  INVALID_SORT: ["sort"],
  INVALID_CATEGORY: ["category"],
  INVALID_DATE_RANGE: ["from", "to"],
  INVALID_AMOUNT_RANGE: ["minAmount", "maxAmount"],
};
