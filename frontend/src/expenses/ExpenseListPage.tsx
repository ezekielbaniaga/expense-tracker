import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/errors";
import {
  NO_DESCRIPTION,
  mapExpensePage,
  type ExpenseListResponseV13Dto,
} from "../api/expense";
import { formatDay } from "../format/dates";
import { formatMoney } from "../format/money";
import { usePreferences } from "../ui/preferences";
import { CategoryChip } from "../ui/Chip";
import { PageHeading } from "../ui/focus";
import { Pagination } from "../ui/Pagination";
import { TableScroll } from "../ui/forms";
import { useToast } from "../ui/Toast";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { INVALID_CODE_PARAMS, readListParams, toApiQuery } from "./listParams";

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.messages[0]) return error.messages[0];
  return "Something went wrong. Please try again.";
}

export function ExpenseListPage() {
  const { client } = useAuth();
  const { currency } = usePreferences();
  const toast = useToast();
  const highlightId = (useLocation().state as { highlightId?: string } | null)?.highlightId;
  const { pageSize } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readListParams(searchParams, pageSize);
  const [notice, setNotice] = useState<string | null>(null);
  const hasFilters =
    params.q !== "" ||
    params.category.length > 0 ||
    params.from !== "" ||
    params.to !== "" ||
    params.minAmount !== "" ||
    params.maxAmount !== "";
  const query = useQuery({
    queryKey: ["expenses", params],
    queryFn: async () =>
      mapExpensePage(
        await client.request<ExpenseListResponseV13Dto>(`/api/expense?${toApiQuery(params)}`, {
          version: "1.3",
        }),
      ),
    // Keep the current page on screen while the next one loads
    placeholderData: (previous) => previous,
  });

  /** Applies the changes to the URL; page goes back to 0 unless it is one of them. */
  const update = (changes: Record<string, string | null>) => {
    setNotice(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (!("page" in changes)) next.delete("page");
      for (const [name, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(name);
        else next.set(name, value);
      }
      return next;
    });
  };

  const failure = query.error;
  const invalidParams =
    failure instanceof ApiError && failure.status === 400 ? INVALID_CODE_PARAMS[failure.code] : undefined;
  useEffect(() => {
    if (invalidParams) {
      // A hand-edited URL or a combination the server refuses; fall back to the defaults for it
      setNotice(`${errorMessage(failure)} Those settings were reset.`);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const name of invalidParams) next.delete(name);
          return next;
        },
        { replace: true },
      );
      return;
    }
    if (failure) toast.showError(`Could not load expenses. ${errorMessage(failure)}`);
  }, [failure, invalidParams, toast, setSearchParams]);

  return (
    <section aria-labelledby="expenses-heading">
      <PageHeading id="expenses-heading">Expenses</PageHeading>
      {query.isPending && <Skeleton label="Loading expenses..." />}
      {query.isError && !invalidParams && (
        <p>
          Expenses could not be loaded.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {query.data &&
        (query.data.total === 0 && hasFilters ? (
          <>
            <p>No expenses match these filters.</p>
            <button type="button" onClick={() => setSearchParams({})}>
              Clear filters
            </button>
          </>
        ) : query.data.total === 0 ? (
          <EmptyState
            title="Nothing here yet."
            action={
              <Link className="btn btn--primary btn--md" to="/expenses/new">
                Add expense
              </Link>
            }
          >
            Add your first expense and it shows up here.
          </EmptyState>
        ) : (
          <>
            <p>
              <span>{query.data.total}</span> expenses, total{" "}
              <strong>{formatMoney(query.data.totalAmount, currency)}</strong>
            </p>
            <TableScroll label="Expenses table">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {query.data.expenses.map((e) => (
                  <tr key={e.id} className={e.id === highlightId ? "row--new" : undefined}>
                    <td>
                      <Link to={`/expenses/${e.id}`}>{e.description ?? NO_DESCRIPTION}</Link>
                    </td>
                    <td>
                      <CategoryChip category={e.category} />
                    </td>
                    <td>{formatDay(e.date)}</td>
                    <td>{formatMoney(e.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          </>
        ))}
      <Pagination
        page={params.page}
        totalPages={query.data?.totalPages ?? 0}
        size={params.size}
        defaultSize={pageSize}
        disabled={!query.data}
        onPage={(page) => update({ page: String(page) })}
        onSize={(size) => update({ size: String(size) })}
      />
    </section>
  );
}
