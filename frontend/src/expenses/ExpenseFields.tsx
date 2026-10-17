import { useQuery } from "@tanstack/react-query";
import type { FieldErrors, Resolver, UseFormRegister, UseFormSetError } from "react-hook-form";
import { useAuth } from "../auth/AuthProvider";
import { fieldErrors, type ApiError } from "../api/errors";
import {
  categoryLabel,
  mapCategories,
  todayIso,
  type AllCategoriesResponseDto,
} from "../api/expense";
import { validateExpense, type ExpenseFormValues } from "./expenseSchema";

const FIELDS = ["description", "amount", "category", "date"] as const;

export function useCategories() {
  const { client } = useAuth();
  return useQuery({
    queryKey: ["categories"],
    // A fixed enum on the server, so one fetch per session is enough
    staleTime: Infinity,
    queryFn: async () =>
      mapCategories(await client.request<AllCategoriesResponseDto>("/api/expense/categories")),
  });
}

/** The create and edit forms share one rule set, so they share one resolver. */
export function expenseResolver(categories: readonly string[]): Resolver<ExpenseFormValues> {
  return (values) => {
    const messages = validateExpense(categories, values);
    const errors = Object.fromEntries(
      Object.entries(messages).map(([name, message]) => [name, { type: "validate", message }]),
    );
    return Object.keys(errors).length === 0 ? { values, errors: {} } : { values: {}, errors };
  };
}

/**
 * Attaches a VALIDATION_ERROR to its fields and returns the text for the rest
 * (form-level messages, fields the form does not have), or null when none.
 */
export function applyServerErrors(
  error: ApiError,
  setError: UseFormSetError<ExpenseFormValues>,
): string | null {
  const { fields, form } = fieldErrors(error);
  const rest = [...form];
  for (const [name, message] of Object.entries(fields)) {
    if ((FIELDS as readonly string[]).includes(name)) {
      setError(name as (typeof FIELDS)[number], { type: "server", message });
    } else {
      rest.push(`${name}: ${message}`);
    }
  }
  return rest.length > 0 ? rest.join(" ") : null;
}

interface Props {
  categories: readonly string[];
  register: UseFormRegister<ExpenseFormValues>;
  errors: FieldErrors<ExpenseFormValues>;
}

export function ExpenseFields({ categories, register, errors }: Props) {
  return (
    <>
      <label htmlFor="description">Description</label>
      <input
        id="description"
        aria-invalid={errors.description ? true : undefined}
        {...register("description")}
      />
      {errors.description && <p>{errors.description.message}</p>}

      <label htmlFor="amount">Amount</label>
      <input
        id="amount"
        inputMode="decimal"
        aria-invalid={errors.amount ? true : undefined}
        {...register("amount")}
      />
      {errors.amount && <p>{errors.amount.message}</p>}

      <label htmlFor="category">Category</label>
      <select id="category" aria-invalid={errors.category ? true : undefined} {...register("category")}>
        <option value="">Select...</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {categoryLabel(c)}
          </option>
        ))}
      </select>
      {errors.category && <p>{errors.category.message}</p>}

      <label htmlFor="date">Date</label>
      <input
        id="date"
        type="date"
        max={todayIso()}
        aria-invalid={errors.date ? true : undefined}
        {...register("date")}
      />
      {errors.date && <p>{errors.date.message}</p>}
    </>
  );
}
