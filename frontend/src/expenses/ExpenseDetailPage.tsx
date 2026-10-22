import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/errors";
import { NO_DESCRIPTION, type ExpenseDto } from "../api/expense";
import { formatLocalDateTime, formatLongDay } from "../format/dates";
import { formatMoney } from "../format/money";
import { usePreferences } from "../ui/preferences";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { CategoryChip } from "../ui/Chip";
import { ChevronLeftIcon } from "../ui/icons";
import { Dialog } from "../ui/Dialog";
import { PageHeading } from "../ui/focus";
import { FormAlert } from "../ui/forms";
import { useToast } from "../ui/Toast";
import { applyServerErrors, ExpenseFields, expenseResolver, useCategories } from "./ExpenseFields";
import { errorMessage } from "./ExpenseListPage";
import {
  toCreateRequest,
  toFormValues,
  type ExpenseFormValues,
} from "./expenseSchema";
import { Skeleton } from "../ui/Skeleton";

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
  const { currency } = usePreferences();
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

  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  // The button that opened a form gets focus back when the form closes
  const openers = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastOpener = useRef<string | null>(null);
  const open = (next: "edit" | "delete") => {
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
        <Link to="/" className="back-link">
          <ChevronLeftIcon size={16} />
          Back to expenses
        </Link>
      </p>
      {query.isPending && <Skeleton label="Loading expense..." />}
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
        <div className="stack">
          <PageHeading id="expense-heading">{e.description ?? NO_DESCRIPTION}</PageHeading>
          <div className="detail-hero">
            <p className="detail-hero__amount">{formatMoney(e.amount, currency)}</p>
            <p className="detail-hero__meta">
              <CategoryChip category={e.category} /> <span>{formatLongDay(e.date)}</span>
            </p>
          </div>
          <Card title="Details">
            <dl className="detail-list">
              <dt>Created</dt>
              <dd>{formatLocalDateTime(e.createdAt)}</dd>
              <dt>Last modified</dt>
              <dd>{e.lastModified ? formatLocalDateTime(e.lastModified) : "Never"}</dd>
            </dl>
            <details className="tech-details">
              <summary>Technical details</summary>
              <dl className="detail-list">
                <dt>Version</dt>
                <dd>{e.version}</dd>
                <dt>Id</dt>
                <dd>
                  <ShortId id={e.id} />
                </dd>
              </dl>
            </details>
          </Card>
          {mode === "view" && (
            <div className="detail-actions">
              <Button
                variant="primary"
                ref={(b) => void (openers.current.edit = b)}
                onClick={() => open("edit")}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                className="btn--danger-ghost"
                ref={(b) => void (openers.current.delete = b)}
                onClick={() => open("delete")}
              >
                Delete
              </Button>
            </div>
          )}
          {mode === "edit" && (
            <EditForm expense={e} onReload={reload} onDone={() => setMode("view")} />
          )}
          {mode === "delete" && (
            <DeleteDialog expense={e} onReload={reload} onCancel={() => setMode("view")} />
          )}
        </div>
      )}
    </section>
  );
}

/** The id shortened for reading, the full value for assistive tech, and a copy button. */
function ShortId({ id }: { id: string }) {
  const toast = useToast();
  const short = id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(id);
      toast.showSuccess("Id copied");
    } catch {
      toast.showError("Could not copy the id");
    }
  };
  return (
    <span className="short-id">
      {short === id ? (
        <span>{id}</span>
      ) : (
        <>
          <span aria-hidden="true">{short}</span>
          <span className="visually-hidden">{id}</span>
        </>
      )}
      <Button variant="ghost" size="sm" aria-label="Copy id" onClick={() => void copy()}>
        Copy
      </Button>
    </span>
  );
}

/** Saves the response as the expense and refreshes every list that shows it. */
function useSaved(onDone: () => void, message: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return async (saved: ExpenseDto) => {
    queryClient.setQueryData(["expense", saved.id], saved);
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    toast.showSuccess(message);
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
  if (!categories.data) return <Skeleton label="Loading categories..." />;
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
  const saved = useSaved(onDone, "Saved");
  const {
    register,
    control,
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
      <ExpenseFields categories={categories} register={register} control={control} errors={errors} autoFocus />
      <WriteNotice failure={failure} onReload={onReload} />
      <div className="form-actions">
        <Button type="submit" variant="primary" pending={update.isPending}>
          Save
        </Button>{" "}
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteDialog({
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
  const toast = useToast();
  const failure = useWriteFailure(expense.id);

  const remove = useMutation({
    mutationFn: () =>
      client.request<void>(
        `/api/expense/${encodeURIComponent(expense.id)}?version=${expense.version}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      // GET now answers 404, so leave and drop the cached copy instead of refetching it
      toast.showSuccess("Expense deleted. It's in Archived for now.");
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
    <Dialog title="Delete this expense?" onClose={onCancel}>
      <p>It moves to Archived and is removed for good later.</p>
      <WriteNotice failure={failure} onReload={onReload} />
      <div className="dialog__actions">
        <Button data-autofocus onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="danger"
          pending={remove.isPending}
          onClick={() => {
            failure.clear();
            remove.mutate();
          }}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
