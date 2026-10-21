import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  NO_DESCRIPTION,
  sortArchivedDesc,
  type ArchivedExpenseListDto,
} from "../api/expense";
import { formatLocalDateTime } from "../format/dates";
import { formatMoney } from "../format/money";
import { usePreferences } from "../ui/preferences";
import { PageHeading } from "../ui/focus";
import { TableScroll } from "../ui/forms";
import { useToast } from "../ui/Toast";
import { errorMessage } from "./ExpenseListPage";
import { Skeleton } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";

/** Read-only: there is no restore endpoint. */
export function ArchivedPage() {
  const { client } = useAuth();
  const { currency } = usePreferences();
  const toast = useToast();
  const query = useQuery({
    queryKey: ["archived"],
    queryFn: async () => {
      const dto = await client.request<ArchivedExpenseListDto>("/api/expense/archived");
      return sortArchivedDesc(dto.expenses);
    },
  });

  const failure = query.error;
  useEffect(() => {
    if (failure) toast.showError(`Could not load archived expenses. ${errorMessage(failure)}`);
  }, [failure, toast]);

  return (
    <section aria-labelledby="archived-heading">
      <PageHeading id="archived-heading">Archived expenses</PageHeading>
      {query.isPending && <Skeleton label="Loading archived expenses..." />}
      {query.isError && (
        <p>
          Archived expenses could not be loaded.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {query.data &&
        (query.data.length === 0 ? (
          <EmptyState title="Nothing archived. Deleted expenses wait here for a while." />
        ) : (
          <TableScroll label="Archived expenses table">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Amount</th>
                <th>Archived at</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((e) => (
                <tr key={e.id}>
                  <td>{e.description ?? NO_DESCRIPTION}</td>
                  <td>{formatMoney(e.amount, currency)}</td>
                  <td>{formatLocalDateTime(e.archivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
        ))}
    </section>
  );
}
