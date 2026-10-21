import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  NO_DESCRIPTION,
  sortArchivedDesc,
  type ArchivedExpenseDto,
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
import { ArchiveIcon } from "../ui/icons";
import { SortableHeader, type SortDirection } from "../ui/SortableHeader";

type SortKey = "description" | "amount" | "archivedAt";

/** Text sorts ascending first; amount and date start with the biggest and newest. */
const NATURAL: Record<SortKey, SortDirection> = { description: "asc", amount: "desc", archivedAt: "desc" };

/** Only reorders (never sums). Missing values go last in either direction. */
function sortRows(rows: ArchivedExpenseDto[], key: SortKey, dir: SortDirection): ArchivedExpenseDto[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = key === "archivedAt" ? Date.parse(a.archivedAt) : a[key];
    const y = key === "archivedAt" ? Date.parse(b.archivedAt) : b[key];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === "string" && typeof y === "string") {
      return sign * x.localeCompare(y, undefined, { sensitivity: "base" });
    }
    return sign * ((x as number) - (y as number));
  });
}

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

  const [sort, setSort] = useState<{ key: SortKey; dir: SortDirection }>({
    key: "archivedAt",
    dir: "desc",
  });
  const rows = useMemo(
    () => (query.data ? sortRows(query.data, sort.key, sort.dir) : []),
    [query.data, sort],
  );
  const header = (key: SortKey, label: string, phrases: { asc: string; desc: string }) => (
    <SortableHeader
      label={label}
      announceName={key === "archivedAt" ? "archived date" : label.toLowerCase()}
      active={sort.key === key}
      direction={sort.dir}
      phrases={phrases}
      onSort={() =>
        setSort((s) => ({ key, dir: s.key === key ? (s.dir === "asc" ? "desc" : "asc") : NATURAL[key] }))
      }
    />
  );

  const failure = query.error;
  useEffect(() => {
    if (failure) toast.showError(`Could not load archived expenses. ${errorMessage(failure)}`);
  }, [failure, toast]);

  return (
    <section aria-labelledby="archived-heading">
      <PageHeading id="archived-heading">Archived expenses</PageHeading>
      <p className="archived-note">Deleted expenses stay here for 30 days, then are removed.</p>
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
                {header("description", "Description", { asc: "A to Z", desc: "Z to A" })}
                {header("amount", "Amount", { asc: "lowest first", desc: "highest first" })}
                {header("archivedAt", "Archived at", { asc: "oldest first", desc: "newest first" })}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="archived-row">
                  <td>
                    <ArchiveIcon size={16} />{e.description ?? NO_DESCRIPTION}
                  </td>
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
