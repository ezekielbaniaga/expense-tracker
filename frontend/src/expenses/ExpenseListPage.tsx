import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
import { SortableHeader, type SortDirection } from "../ui/SortableHeader";
import { CATEGORY_LABELS, type Category } from "../api/expense";
import { ChipGroup } from "../ui/Chip";
import { INVALID_CODE_PARAMS, PERIOD_CHIPS, detectPeriod, periodRange, readListParams, toApiQuery, type Period } from "./listParams";

const SEARCH_DEBOUNCE_MS = 300;
const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));

type SortKey = "description" | "category" | "date" | "amount";

const NATURAL: Record<SortKey, SortDirection> = {
  description: "asc",
  category: "asc",
  date: "desc",
  amount: "desc",
};

const PHRASES: Record<SortKey, { asc: string; desc: string }> = {
  description: { asc: "A to Z", desc: "Z to A" },
  category: { asc: "A to Z", desc: "Z to A" },
  date: { asc: "oldest first", desc: "newest first" },
  amount: { asc: "lowest first", desc: "highest first" },
};

const HEADERS: { key: SortKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "date", label: "Date" },
  { key: "amount", label: "Amount" },
];

/** The phone "Sort by" choices; the values are the same `sort` param the headers write. */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "date,desc", label: "Newest" },
  { value: "date,asc", label: "Oldest" },
  { value: "amount,desc", label: "Highest amount" },
  { value: "amount,asc", label: "Lowest amount" },
  { value: "description,asc", label: "Description A\u2013Z" },
  { value: "description,desc", label: "Description Z\u2013A" },
  { value: "category,asc", label: "Category" },
];

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
  const period = detectPeriod(params.from, params.to);
  // Anything but the defaults (This month, no search, no category, no amounts)
  const hasFilters =
    params.q !== "" ||
    params.category.length > 0 ||
    period !== "month" ||
    params.minAmount !== "" ||
    params.maxAmount !== "";
  // The Filters button counts groups: categories, a custom date range, amounts
  const activeFilters =
    (params.category.length > 0 ? 1 : 0) +
    (period === "custom" ? 1 : 0) +
    (params.minAmount !== "" || params.maxAmount !== "" ? 1 : 0);
  // One markup: collapsed on phones until the button is pressed; CSS keeps it open from 48rem
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchText, setSearchText] = useState(params.q);
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

  const updateRef = useRef(update);
  updateRef.current = update;
  const urlQ = params.q;
  // Typing waits 300 ms before it reaches the URL (and so the request)
  useEffect(() => {
    const text = searchText.trim();
    if (text === urlQ) return;
    const timer = setTimeout(() => updateRef.current({ q: text }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, urlQ]);
  // The URL changed elsewhere (Clear filters, back button): show it in the box
  useEffect(() => setSearchText(urlQ), [urlQ]);

  const choosePeriod = (value: Period) => {
    if (value === "custom") {
      setFiltersOpen(true);
      return;
    }
    if (value === "month") update({ from: null, to: null, period: null });
    else if (value === "all") update({ from: null, to: null, period: "all" });
    else update({ ...periodRange(value), period: null });
  };
  /** An explicit date edit; clearing both would otherwise snap back to This month. */
  const setDate = (name: "from" | "to", value: string) => {
    const other = name === "from" ? params.to : params.from;
    update({ [name]: value, period: value === "" && other === "" ? "all" : null });
  };

  const [sortKey, sortDir] = params.sort.split(",") as [string, SortDirection];
  const sortBy = (key: SortKey) =>
    update({ sort: `${key},${sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : NATURAL[key]}` });

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
      <div className="list-controls">
        <ChipGroup
          legend="Period"
          name="period"
          className="list-controls__period"
          options={PERIOD_CHIPS}
          value={period}
          onChange={(v) => choosePeriod(v as Period)}
        />
        <div className="list-controls__search">
          <label htmlFor="expense-search">Search descriptions</label>
          <input
            id="expense-search"
            type="search"
            placeholder="Search descriptions"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <button
            type="button"
            className="list-controls__toggle"
            aria-expanded={filtersOpen}
            aria-controls="expense-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {activeFilters > 0 ? `Filters \u00b7 ${activeFilters}` : "Filters"}
          </button>
        </div>
        <div id="expense-filters" className="list-controls__filters" data-open={filtersOpen}>
          <ChipGroup
            legend="Category"
            name="category"
            multiple
            options={CATEGORY_OPTIONS}
            value={params.category}
            onChange={(v) => {
              setNotice(null);
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.delete("page");
                next.delete("category");
                for (const c of v) next.append("category", c);
                return next;
              });
            }}
          />
          <div className="list-controls__range">
            <label htmlFor="filter-from">From</label>
            <input id="filter-from" type="date" value={params.from} onChange={(e) => setDate("from", e.target.value)} />
            <label htmlFor="filter-to">To</label>
            <input id="filter-to" type="date" value={params.to} onChange={(e) => setDate("to", e.target.value)} />
          </div>
          <div className="list-controls__range">
            <label htmlFor="filter-min">Min amount</label>
            <input id="filter-min" type="number" min="0" step="0.01" inputMode="decimal" value={params.minAmount}
              onChange={(e) => update({ minAmount: e.target.value })} />
            <label htmlFor="filter-max">Max amount</label>
            <input id="filter-max" type="number" min="0" step="0.01" inputMode="decimal" value={params.maxAmount}
              onChange={(e) => update({ maxAmount: e.target.value })} />
          </div>
        </div>
        {hasFilters && (
          <button type="button" onClick={() => setSearchParams({})}>
            Clear filters
          </button>
        )}
      </div>
      {query.data &&
        (query.data.total === 0 && hasFilters ? (
          <p>No expenses match these filters.</p>
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
            <div className="sort-select">
              <label htmlFor="sort-by">Sort by</label>
              <select id="sort-by" value={params.sort} onChange={(event) => update({ sort: event.target.value })}>
                {!SORT_OPTIONS.some((o) => o.value === params.sort) && (
                  <option value={params.sort}>Other</option>
                )}
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <TableScroll label="Expenses table">
            <table className="expense-table">
              <thead>
                <tr>
                  {HEADERS.map(({ key, label }) => (
                    <SortableHeader
                      key={key}
                      label={label}
                      active={sortKey === key}
                      direction={sortDir}
                      phrases={PHRASES[key]}
                      onSort={() => sortBy(key)}
                    />
                  ))}
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
