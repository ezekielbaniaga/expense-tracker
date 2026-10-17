import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/errors";
import { categoryLabel, formatAmount, formatArchivedAt, type ExpenseDto } from "../api/expense";
import { PageHeading } from "../ui/focus";
import { FieldError, errorProps, FormAlert } from "../ui/forms";
import { useToast } from "../ui/Toast";
import { applyServerErrors, ExpenseFields, expenseResolver, useCategories } from "./ExpenseFields";
import { errorMessage } from "./ExpenseListPage";
import {
  toCreateRequest,
  toFormValues,
  validateDescription,
  type ExpenseFormValues,
} from "./expenseSchema";

/**
 * 404 and 400 (a malformed id) look the same on purpose, and archived expenses
 * answer 404 here, so the page never reveals whether an expense exists.
 */
function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 400);
}

export function ExpenseDetailPage() {
  const { id = "" } = useParams();
  const { client } = useAuth();
  const toast = useToast();
  const query = useQuery({
    queryKey: ["expense", id],
    queryFn: () => client.request<ExpenseDto>(`/api/expense/${encodeURIComponent(id)}`),
  });

  const reload = () => void query.refetch();

  const failure = query.error;
  const notFound = isNotFound(failure);
  useEffect(() => {
    if (failure && !isNotFound(failure)) {
      toast.showError(`Could not load the expense. ${errorMessage(failure)}`);
    }
  }, [failure, toast]);

  const [mode, setMode] = useState<"view" | "edit" | "description" | "delete">("view");
  // The button that opened a form gets focus back when the form closes
  const openers = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastOpener = useRef<string | null>(null);
  const open = (next: "edit" | "description" | "delete") => {
    lastOpener.current = next;
    setMode(next);
  };
  useEffect(() => {
    if (mode === "view" && lastOpener.current) openers.current[lastOpener.current]?.focus();
  }, [mode]);
  const e = query.data;
  return (
    <section aria-labelledby="expense-heading">
      <p>
        <Link to="/">Back to expenses</Link>
      </p>
      {query.isPending && <p role="status">Loading expense...</p>}
      {notFound && <PageHeading id="expense-heading">Not found</PageHeading>}
      {query.isError && !notFound && (
        <p>
          The expense could not be loaded.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {e && (
        <>
          <PageHeading id="expense-heading">{e.description}</PageHeading>
          <dl>
            <dt>Id</dt>
            <dd>{e.id}</dd>
            <dt>Amount</dt>
            <dd>{formatAmount(e.amount)}</dd>
            <dt>Category</dt>
            <dd>{categoryLabel(e.category)}</dd>
            <dt>Date</dt>
            <dd>{e.date}</dd>
            <dt>Version</dt>
            <dd>{e.version}</dd>
            <dt>Created</dt>
            <dd>{formatArchivedAt(e.createdAt)}</dd>
            <dt>Last modified</dt>
            <dd>{formatArchivedAt(e.lastModified)}</dd>
          </dl>
          {mode === "view" && (
            <p>
              <button type="button" ref={(b) => void (openers.current.edit = b)} onClick={() => open("edit")}>
                Edit
              </button>{" "}
              <button
                type="button"
                ref={(b) => void (openers.current.description = b)}
                onClick={() => open("description")}
              >
                Edit description
              </button>{" "}
              <button type="button" ref={(b) => void (openers.current.delete = b)} onClick={() => open("delete")}>
                Delete
              </button>
            </p>
          )}
          {mode === "edit" && (
            <EditForm expense={e} onReload={reload} onDone={() => setMode("view")} />
          )}
          {mode === "description" && (
            <DescriptionForm expense={e} onReload={reload} onDone={() => setMode("view")} />
          )}
          {mode === "delete" && (
            <DeletePanel expense={e} onReload={reload} onCancel={() => setMode("view")} />
          )}
        </>
      )}
    </section>
  );
}

/** Saves the response as the expense and refreshes every list that shows it. */
function useSaved(onDone: () => void) {
  const queryClient = useQueryClient();
  return async (saved: ExpenseDto) => {
    queryClient.setQueryData(["expense", saved.id], saved);
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    onDone();
  };
}

/**
 * Shared 409 handling. A stale version offers Reload and keeps the person's
 * input; a MODIFY_ARCHIVED means another tab deleted the expense. Other errors
 * go to `other`, which returns true when it handled them.
 */
function useWriteFailure(id: string, other?: (error: ApiError) => boolean) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [message, setMessage] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const handle = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409 && error.code === "MODIFY_ARCHIVED") {
      toast.showError("This expense was deleted.");
      // Leave the page first so the removed query is not refetched (it would 404)
      navigate("/");
      queryClient.removeQueries({ queryKey: ["expense", id] });
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["archived"] });
      return;
    }
    if (error instanceof ApiError && error.status === 409 && error.code === "CONCURRENT_MODIFICATION") {
      setStale(true);
      return;
    }
    if (error instanceof ApiError && other?.(error)) return;
    setMessage("Something went wrong, try again");
  };
  const clear = () => {
    setMessage(null);
    setStale(false);
  };
  return { message, setMessage, stale, handle, clear };
}

function WriteNotice({
  failure,
  onReload,
}: {
  failure: ReturnType<typeof useWriteFailure>;
  onReload: () => void;
}) {
  return (
    <>
      {failure.stale && (
        <p role="alert">
          This expense was changed elsewhere. Reload to get the latest version; your input is kept.{" "}
          <button
            type="button"
            onClick={() => {
              failure.clear();
              onReload();
            }}
          >
            Reload
          </button>
        </p>
      )}
      {failure.message && <FormAlert>{failure.message}</FormAlert>}
    </>
  );
}

interface FormProps {
  expense: ExpenseDto;
  onReload: () => void;
  onDone: () => void;
}

function EditForm({ expense, onReload, onDone }: FormProps) {
  const categories = useCategories();
  if (categories.isError) {
    return (
      <p>
        Categories could not be loaded.{" "}
        <button type="button" onClick={() => void categories.refetch()}>
          Retry
        </button>
      </p>
    );
  }
  if (!categories.data) return <p role="status">Loading categories...</p>;
  return (
    <EditFormFields
      expense={expense}
      categories={categories.data.supportedCategories}
      onReload={onReload}
      onDone={onDone}
    />
  );
}

function EditFormFields({
  expense,
  categories,
  onReload,
  onDone,
}: FormProps & { categories: readonly string[] }) {
  const { client } = useAuth();
  const saved = useSaved(onDone);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: expenseResolver(categories),
    defaultValues: toFormValues(expense),
  });
  const failure = useWriteFailure(expense.id, (error) => {
    if (error.status === 400 && error.code === "VALIDATION_ERROR") {
      failure.setMessage(applyServerErrors(error, setError));
      return true;
    }
    if (error.status === 400 && error.code === "INVALID_CATEGORY") {
      failure.setMessage(error.messages[0] ?? "Invalid category");
      return true;
    }
    return false;
  });

  // The version comes from the cache at submit time, so Reload then resubmit works
  const update = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      client.request<ExpenseDto>(`/api/expense/${encodeURIComponent(expense.id)}`, {
        method: "PUT",
        body: { ...toCreateRequest(values), version: expense.version },
      }),
    onSuccess: saved,
    onError: failure.handle,
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        failure.clear();
        update.mutate(values);
      })}
      noValidate
    >
      <ExpenseFields categories={categories} register={register} errors={errors} autoFocus />
      <WriteNotice failure={failure} onReload={onReload} />
      <button type="submit" disabled={update.isPending}>
        Save
      </button>{" "}
      <button type="button" onClick={onDone}>
        Cancel
      </button>
    </form>
  );
}

function DescriptionForm({ expense, onReload, onDone }: FormProps) {
  const { client } = useAuth();
  const saved = useSaved(onDone);
  const [description, setDescription] = useState(expense.description);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const failure = useWriteFailure(expense.id, (error) => {
    if (error.status === 400 && error.code === "VALIDATION_ERROR") {
      failure.setMessage(error.messages.join(" "));
      return true;
    }
    return false;
  });

  const patch = useMutation({
    mutationFn: () =>
      client.request<ExpenseDto>(`/api/expense/${encodeURIComponent(expense.id)}/description`, {
        method: "PATCH",
        body: { version: expense.version, description },
      }),
    onSuccess: saved,
    onError: failure.handle,
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        failure.clear();
        const message = validateDescription(description);
        setFieldError(message);
        if (message) inputRef.current?.focus();
        else patch.mutate();
      }}
    >
      <label htmlFor="description">Description</label>
      <input
        id="description"
        ref={inputRef}
        value={description}
        autoFocus
        {...errorProps("description", fieldError)}
        onChange={(event) => setDescription(event.target.value)}
      />
      <FieldError id="description" message={fieldError} />
      <WriteNotice failure={failure} onReload={onReload} />
      <button type="submit" disabled={patch.isPending}>
        Save description
      </button>{" "}
      <button type="button" onClick={onDone}>
        Cancel
      </button>
    </form>
  );
}

function DeletePanel({
  expense,
  onReload,
  onCancel,
}: {
  expense: ExpenseDto;
  onReload: () => void;
  onCancel: () => void;
}) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const failure = useWriteFailure(expense.id);

  const remove = useMutation({
    mutationFn: () =>
      client.request<void>(
        `/api/expense/${encodeURIComponent(expense.id)}?version=${expense.version}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      // GET now answers 404, so leave and drop the cached copy instead of refetching it
      navigate("/");
      queryClient.removeQueries({ queryKey: ["expense", expense.id] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["expenses"] }),
        queryClient.invalidateQueries({ queryKey: ["archived"] }),
      ]);
    },
    onError: failure.handle,
  });

  return (
    <div>
      <p>Delete this expense? It moves to the archived list.</p>
      <WriteNotice failure={failure} onReload={onReload} />
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => {
          failure.clear();
          remove.mutate();
        }}
      >
        Confirm delete
      </button>{" "}
      <button type="button" autoFocus onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
