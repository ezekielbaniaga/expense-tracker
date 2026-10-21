import { useEffect } from "react";
import type { SetURLSearchParams } from "react-router-dom";

interface PagedData {
  total: number;
  totalPages: number;
}

/**
 * A page past the end (an old link, or the last item of the last page deleted) shows an empty
 * table. Once the response for the current params is in, replace the URL's page with the last one.
 * `stale` is true while a placeholder from the previous query is shown; that data says nothing
 * about the current page. Nothing happens when there are no rows at all (the empty state shows).
 */
export function useClampPage(
  setParams: SetURLSearchParams,
  page: number,
  data: PagedData | undefined,
  stale: boolean,
) {
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  useEffect(() => {
    if (stale || total === 0 || totalPages === 0) return;
    const last = totalPages - 1;
    if (page <= last) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("page", String(last));
        return next;
      },
      { replace: true },
    );
  }, [stale, total, totalPages, page, setParams]);
}
