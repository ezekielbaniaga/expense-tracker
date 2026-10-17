import { z } from "zod";
import { isFutureDate, type Category } from "../api/expense";

/** The form keeps every field as text; `toCreateRequest` converts the amount. */
export interface ExpenseFormValues {
  description: string;
  amount: string;
  category: string;
  date: string;
}

/** Up to 8 integer digits and 2 decimals, the backend's NUMERIC(10,2) column. */
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

/**
 * Mirrors the backend's CreateExpenseRequest. The categories come from the
 * endpoint, so the schema is built once they are loaded.
 */
export function createExpenseSchema(categories: readonly string[]) {
  return z.object({
    description: z
      .string()
      .refine((v) => v.trim() !== "", "Description is required")
      .refine((v) => v.length <= 250, "Description must be at most 250 characters"),
    amount: z
      .string()
      .trim()
      .min(1, "Amount is required")
      .refine((v) => AMOUNT_PATTERN.test(v), "Amount must be a number with at most 8 digits and 2 decimals")
      .refine((v) => !AMOUNT_PATTERN.test(v) || Number(v) > 0, "Amount must be greater than 0"),
    category: z.string().refine((v) => categories.includes(v), "Choose a category"),
    date: z
      .string()
      .min(1, "Date is required")
      .refine((v) => !isFutureDate(v), "Date must be today or earlier"),
  });
}

/** First message per field, in the shape react-hook-form's resolver expects. */
export function validateExpense(
  categories: readonly string[],
  values: ExpenseFormValues,
): Partial<Record<keyof ExpenseFormValues, string>> {
  const result = createExpenseSchema(categories).safeParse(values);
  const errors: Partial<Record<keyof ExpenseFormValues, string>> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof ExpenseFormValues;
      if (!(field in errors)) errors[field] = issue.message;
    }
  }
  return errors;
}

export function toCreateRequest(values: ExpenseFormValues) {
  return {
    description: values.description,
    amount: Number(values.amount.trim()),
    category: values.category as Category,
    date: values.date,
  };
}
