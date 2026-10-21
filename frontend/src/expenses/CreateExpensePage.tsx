import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/errors";
import { formatAmount, NO_DESCRIPTION, todayIso, type ExpenseDto } from "../api/expense";
import { applyServerErrors, ExpenseFields, expenseResolver, useCategories } from "./ExpenseFields";
import { Button } from "../ui/Button";
import { PageHeading } from "../ui/focus";
import { FormAlert } from "../ui/forms";
import { toCreateRequest, type ExpenseFormValues } from "./expenseSchema";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";

export function CreateExpensePage() {
  const categories = useCategories();

  return (
    <section aria-labelledby="create-heading">
      <p>
        <Link to="/">Back to expenses</Link>
      </p>
      <PageHeading id="create-heading">New expense</PageHeading>
      {categories.isPending && <Skeleton label="Loading categories..." />}
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
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: expenseResolver(categories),
    defaultValues: { description: "", amount: "", category: "", date: todayIso() },
  });

  const create = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      client.request<ExpenseDto>("/api/expense", { method: "POST", body: toCreateRequest(values) }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.showSuccess(`Added ${created.description ?? NO_DESCRIPTION} · ${formatAmount(created.amount)}`);
      navigate(`/expenses/${created.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        if (error.code === "VALIDATION_ERROR") {
          setFormError(applyServerErrors(error, setError));
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
      <ExpenseFields categories={categories} register={register} errors={errors} />

      {formError && <FormAlert>{formError}</FormAlert>}
      <Button type="submit" variant="primary" pending={create.isPending}>
        Add expense
      </Button>
    </form>
  );
}
