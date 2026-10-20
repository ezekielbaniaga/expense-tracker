export type Category = "FOOD" | "TRANSPORT" | "BILLS" | "ENTERTAINMENT";

/**
 * DTOs as the backend serializes them. Most properties are camelCase, but the
 * list wrapper and the categories response use snake_case (`total_amount`,
 * `supported_categories`). Amounts are JSON numbers, `date` is "YYYY-MM-DD".
 */
export interface ExpenseDto {
  id: string;
  version: number;
  description: string | null;
  amount: number | null;
  category: Category | null;
  date: string | null;
  createdAt: string | null;
  lastModified: string | null;
}

/** Item of the version 1.2 list. */
export interface ExpenseListItemDto {
  id: string;
  description: string | null;
  amount: number | null;
  category: Category | null;
  date: string | null;
  version: number;
}

export interface ExpenseListResponseDto {
  expenses: ExpenseListItemDto[];
  count: number;
  total_amount: number;
}

export interface AllCategoriesResponseDto {
  supported_categories: Category[];
}

/** Body of POST, and of PUT with `version` added. */
export interface CreateExpenseRequest {
  description: string;
  amount: number;
  category: Category;
  date: string;
}

export interface UpdateExpenseRequest extends CreateExpenseRequest {
  version: number;
}

export interface ExpenseList {
  expenses: ExpenseListItemDto[];
  count: number;
  /** The server's total. Never sum amounts in the browser. */
  totalAmount: number;
}

export interface Categories {
  supportedCategories: Category[];
}

export function mapExpenseList(dto: ExpenseListResponseDto): ExpenseList {
  return { expenses: dto.expenses, count: dto.count, totalAmount: dto.total_amount };
}

export function mapCategories(dto: AllCategoriesResponseDto): Categories {
  return { supportedCategories: dto.supported_categories };
}

/** Shown for a field that is null on a legacy row (V1 left these columns nullable). */
export const MISSING = "—";

/** Shown where a null description would be the link text or heading. */
export const NO_DESCRIPTION = "(no description)";

/** For display only: always 2 decimals. */
export function formatAmount(amount: number | null): string {
  return amount === null ? MISSING : amount.toFixed(2);
}

/** Local calendar date as YYYY-MM-DD (not toISOString, which is UTC). */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** The backend requires today or earlier; YYYY-MM-DD compares correctly as text. */
export function isFutureDate(date: string, now: Date = new Date()): boolean {
  return date > todayIso(now);
}

/** Item of `GET /api/expense/archived`; `archivedAt` is UTC without offset. */
export interface ArchivedExpenseDto {
  id: string;
  description: string | null;
  amount: number | null;
  archivedAt: string;
}

export interface ArchivedExpenseListDto {
  expenses: ArchivedExpenseDto[];
  count: number;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  FOOD: "Food",
  TRANSPORT: "Transport",
  BILLS: "Bills",
  ENTERTAINMENT: "Entertainment",
};

/** Label for display; an unknown value from a newer server is shown as sent. */
export function categoryLabel(category: string | null): string {
  if (category === null) return MISSING;
  return (CATEGORY_LABELS as Record<string, string>)[category] ?? category;
}

/** Newest `archivedAt` first; the server returns them unordered. Does not mutate. */
export function sortArchivedDesc(expenses: ArchivedExpenseDto[]): ArchivedExpenseDto[] {
  return [...expenses].sort((a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt));
}

/** "2026-10-18T09:05:03.123" to "2026-10-18 09:05". */
export function formatArchivedAt(archivedAt: string | null): string {
  if (archivedAt === null) return MISSING;
  return archivedAt.replace("T", " ").slice(0, 16);
}
