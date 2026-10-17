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
import { FieldError, errorProps } from "../ui/forms";
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
  let focused = false;
  for (const [name, message] of Object.entries(fields)) {
    if ((FIELDS as readonly string[]).includes(name)) {
      // The first field with an error takes focus
      setError(name as (typeof FIELDS)[number], { type: "server", message }, { shouldFocus: !focused });
      focused = true;
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
  /** Focuses the description when the form opens (the edit form; the create page keeps focus on its heading). */
  autoFocus?: boolean;
}

export function ExpenseFields({ categories, register, errors, autoFocus }: Props) {
  return (
    <>
      <label htmlFor="description">Description</label>
      <input
        id="description"
        autoFocus={autoFocus}
        {...errorProps("description", errors.description?.message)}
        {...register("description")}
      />
      <FieldError id="description" message={errors.description?.message} />

      <label htmlFor="amount">Amount</label>
      <input
        id="amount"
        inputMode="decimal"
        {...errorProps("amount", errors.amount?.message)}
        {...register("amount")}
      />
      <FieldError id="amount" message={errors.amount?.message} />

      <label htmlFor="category">Category</label>
      <select id="category" {...errorProps("category", errors.category?.message)} {...register("category")}>
        <option value="">Select...</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {categoryLabel(c)}
          </option>
        ))}
      </select>
      <FieldError id="category" message={errors.category?.message} />

      <label htmlFor="date">Date</label>
      <input
        id="date"
        type="date"
        max={todayIso()}
        {...errorProps("date", errors.date?.message)}
        {...register("date")}
      />
      <FieldError id="date" message={errors.date?.message} />
    </>
  );
}
