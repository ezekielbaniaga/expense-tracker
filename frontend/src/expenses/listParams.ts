import { CATEGORY_LABELS, type Category } from "../api/expense";

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
] as const;

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

/**
 * Reads the list state from the URL. A value that could not be sent (a bad date,
 * an unknown category) is dropped, so a hand-edited link still loads.
 */
export function readListParams(params: URLSearchParams, defaultSize: number): ListParams {
  const size = nonNegativeInt(params.get("size"), defaultSize);
  const sort = params.get("sort");
  return {
    q: params.get("q") ?? "",
    category: [...new Set(params.getAll("category"))].filter((c): c is Category => c in CATEGORY_LABELS),
    from: validDate(params.get("from")),
    to: validDate(params.get("to")),
    minAmount: validAmount(params.get("minAmount")),
    maxAmount: validAmount(params.get("maxAmount")),
    sort: sort !== null && SORT_PATTERN.test(sort) ? sort : DEFAULT_SORT,
    page: nonNegativeInt(params.get("page"), 0),
    size: size >= 1 ? size : defaultSize,
  };
}

/** The URL form: defaults and empty filters are left out. */
export function toSearchParams(p: ListParams, defaultSize: number): URLSearchParams {
  const out = new URLSearchParams();
  if (p.q.trim() !== "") out.set("q", p.q.trim());
  for (const c of p.category) out.append("category", c);
  if (p.from !== "") out.set("from", p.from);
  if (p.to !== "") out.set("to", p.to);
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

/** Which params a 400 code refers to, so just those go back to their defaults. */
export const INVALID_CODE_PARAMS: Record<string, string[]> = {
  INVALID_PAGE: ["page", "size"],
  INVALID_SORT: ["sort"],
  INVALID_CATEGORY: ["category"],
  INVALID_DATE_RANGE: ["from", "to"],
  INVALID_AMOUNT_RANGE: ["minAmount", "maxAmount"],
};
