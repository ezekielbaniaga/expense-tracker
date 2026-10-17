export type Category = "FOOD" | "TRANSPORT" | "BILLS" | "ENTERTAINMENT";

/**
 * DTOs as the backend serializes them. Most properties are camelCase, but the
 * list wrapper and the categories response use snake_case (`total_amount`,
 * `supported_categories`). Amounts are JSON numbers, `date` is "YYYY-MM-DD".
 */
export interface ExpenseDto {
  id: string;
  version: number;
  description: string;
  amount: number;
  category: Category;
  date: string;
  createdAt: string;
  lastModified: string;
}

/** Item of the version 1.2 list. */
export interface ExpenseListItemDto {
  id: string;
  description: string;
  amount: number;
  category: Category;
  date: string;
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

/** For display only: always 2 decimals. */
export function formatAmount(amount: number): string {
  return amount.toFixed(2);
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
