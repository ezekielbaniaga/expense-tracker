import { useQuery } from "@tanstack/react-query";
import { Controller, type Control, type FieldErrors, type Resolver, type UseFormRegister, type UseFormSetError } from "react-hook-form";
import { useAuth } from "../auth/AuthProvider";
import { fieldErrors, type ApiError } from "../api/errors";
import {
  categoryLabel,
  mapCategories,
  todayIso,
  type AllCategoriesResponseDto,
} from "../api/expense";
import { categoryIcon, ChipGroup } from "../ui/Chip";
import { AmountField, DateField, TextField } from "../ui/fields";
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
  control: Control<ExpenseFormValues>;
  errors: FieldErrors<ExpenseFormValues>;
  /** Focuses the description when the form opens (the edit form; the create page keeps focus on its heading). */
  autoFocus?: boolean;
}

export function ExpenseFields({ categories, register, control, errors, autoFocus }: Props) {
  return (
    <>
      <AmountField
        id="amount"
        label="Amount"
        error={errors.amount?.message}
        {...register("amount")}
      />
      <TextField
        id="description"
        label="Description"
        autoFocus={autoFocus}
        error={errors.description?.message}
        {...register("description")}
      />
      <Controller
        name="category"
        control={control}
        render={({ field }) => (
          <ChipGroup
            legend="Category"
            name="category"
            value={field.value}
            onChange={field.onChange}
            error={errors.category?.message}
            options={categories.map((c) => ({ value: c, label: categoryLabel(c), icon: categoryIcon(c) }))}
          />
        )}
      />
      <DateField
        id="date"
        label="Date"
        max={todayIso()}
        error={errors.date?.message}
        {...register("date")}
      />
    </>
  );
}
