import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/errors";
import {
  MISSING,
  NO_DESCRIPTION,
  formatAmount,
  mapExpenseList,
  type ExpenseListResponseDto,
} from "../api/expense";
import { CategoryChip } from "../ui/Chip";
import { PageHeading } from "../ui/focus";
import { TableScroll } from "../ui/forms";
import { useToast } from "../ui/Toast";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.messages[0]) return error.messages[0];
  return "Something went wrong. Please try again.";
}

export function ExpenseListPage() {
  const { client } = useAuth();
  const toast = useToast();
  const query = useQuery({
    queryKey: ["expenses"],
    queryFn: async () =>
      mapExpenseList(
        await client.request<ExpenseListResponseDto>("/api/expense", { version: "1.2" }),
      ),
  });

  const failure = query.error;
  useEffect(() => {
    if (failure) toast.showError(`Could not load expenses. ${errorMessage(failure)}`);
  }, [failure, toast]);

  return (
    <section aria-labelledby="expenses-heading">
      <PageHeading id="expenses-heading">Expenses</PageHeading>
      {query.isPending && <Skeleton label="Loading expenses..." />}
      {query.isError && (
        <p>
          Expenses could not be loaded.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {query.data &&
        (query.data.count === 0 ? (
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
              <span>{query.data.count}</span> expenses, total{" "}
              <strong>{formatAmount(query.data.totalAmount)}</strong>
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
                  <tr key={e.id}>
                    <td>
                      <Link to={`/expenses/${e.id}`}>{e.description ?? NO_DESCRIPTION}</Link>
                    </td>
                    <td>
                      <CategoryChip category={e.category} />
                    </td>
                    <td>{e.date ?? MISSING}</td>
                    <td>{formatAmount(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          </>
        ))}
    </section>
  );
}
