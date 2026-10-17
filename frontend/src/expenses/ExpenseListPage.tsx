import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../api/errors";
import {
  categoryLabel,
  formatAmount,
  mapExpenseList,
  type ExpenseListResponseDto,
} from "../api/expense";
import { useToast } from "../ui/Toast";

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
      <h2 id="expenses-heading">Expenses</h2>
      {query.isPending && <p role="status">Loading expenses...</p>}
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
          <p>No expenses yet.</p>
        ) : (
          <>
            <p>
              <span>{query.data.count}</span> expenses, total{" "}
              <strong>{formatAmount(query.data.totalAmount)}</strong>
            </p>
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
                      <Link to={`/expenses/${e.id}`}>{e.description}</Link>
                    </td>
                    <td>{categoryLabel(e.category)}</td>
                    <td>{e.date}</td>
                    <td>{formatAmount(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ))}
    </section>
  );
}
