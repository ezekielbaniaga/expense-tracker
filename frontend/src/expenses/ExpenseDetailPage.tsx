import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/errors";
import { categoryLabel, formatAmount, formatArchivedAt, type ExpenseDto } from "../api/expense";
import { useToast } from "../ui/Toast";
import { errorMessage } from "./ExpenseListPage";

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

  const failure = query.error;
  const notFound = isNotFound(failure);
  useEffect(() => {
    if (failure && !isNotFound(failure)) {
      toast.showError(`Could not load the expense. ${errorMessage(failure)}`);
    }
  }, [failure, toast]);

  const e = query.data;
  return (
    <section aria-labelledby="expense-heading">
      <p>
        <Link to="/">Back to expenses</Link>
      </p>
      {query.isPending && <p role="status">Loading expense...</p>}
      {notFound && <h2 id="expense-heading">Not found</h2>}
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
          <h2 id="expense-heading">{e.description}</h2>
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
        </>
      )}
    </section>
  );
}
