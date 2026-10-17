import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, fieldErrors } from "../api/errors";
import {
  categoryLabel,
  mapCategories,
  todayIso,
  type AllCategoriesResponseDto,
  type ExpenseDto,
} from "../api/expense";
import { toCreateRequest, validateExpense, type ExpenseFormValues } from "./expenseSchema";

const FIELDS = ["description", "amount", "category", "date"] as const;

export function CreateExpensePage() {
  const { client } = useAuth();
  const categories = useQuery({
    queryKey: ["categories"],
    // A fixed enum on the server, so one fetch per session is enough
    staleTime: Infinity,
    queryFn: async () =>
      mapCategories(await client.request<AllCategoriesResponseDto>("/api/expense/categories")),
  });

  return (
    <section aria-labelledby="create-heading">
      <p>
        <Link to="/">Back to expenses</Link>
      </p>
      <h2 id="create-heading">New expense</h2>
      {categories.isPending && <p role="status">Loading categories...</p>}
      {categories.isError && (
        <p>
          Categories could not be loaded.{" "}
          <button type="button" onClick={() => void categories.refetch()}>
            Retry
          </button>
        </p>
      )}
      {categories.data && <CreateExpenseForm categories={categories.data.supportedCategories} />}
    </section>
  );
}

function CreateExpenseForm({ categories }: { categories: readonly string[] }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const resolver: Resolver<ExpenseFormValues> = (values) => {
    const messages = validateExpense(categories, values);
    const errors = Object.fromEntries(
      Object.entries(messages).map(([name, message]) => [name, { type: "validate", message }]),
    );
    return Object.keys(errors).length === 0 ? { values, errors: {} } : { values: {}, errors };
  };
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver,
    defaultValues: { description: "", amount: "", category: "", date: todayIso() },
  });

  const create = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      client.request<ExpenseDto>("/api/expense", { method: "POST", body: toCreateRequest(values) }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      navigate(`/expenses/${created.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        if (error.code === "VALIDATION_ERROR") {
          const { fields, form } = fieldErrors(error);
          const rest = [...form];
          for (const [name, message] of Object.entries(fields)) {
            if ((FIELDS as readonly string[]).includes(name)) {
              setError(name as (typeof FIELDS)[number], { type: "server", message });
            } else {
              rest.push(`${name}: ${message}`);
            }
          }
          setFormError(rest.length > 0 ? rest.join(" ") : null);
          return;
        }
        if (error.code === "INVALID_CATEGORY") {
          setFormError(error.messages[0] ?? "Invalid category");
          return;
        }
      }
      setFormError("Something went wrong, try again");
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    create.mutate(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate>
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

      {formError && <p role="alert">{formError}</p>}
      <button type="submit" disabled={create.isPending}>
        Add expense
      </button>
    </form>
  );
}
