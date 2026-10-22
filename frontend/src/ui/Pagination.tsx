export const PAGE_SIZES = [10, 20, 50, 100];

interface PaginationProps {
  /** Zero-based current page. */
  page: number;
  totalPages: number;
  size: number;
  /** The size shown when `size` is not one of the offered ones. */
  defaultSize: number;
  /** Every match across all pages; undefined until the first response, when nothing is shown. */
  total: number | undefined;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}

/**
 * Previous / Next, "Page x of y" and a per-page select. Each part appears only when it has something to
 * do: the buttons and status with more than one page, the select with more rows than the smallest size.
 */
export function Pagination({ page, totalPages, size, defaultSize, total, onPage, onSize }: PaginationProps) {
  if (total === undefined) return null;
  const showPages = totalPages > 1;
  const showSize = total > PAGE_SIZES[0];
  if (!showPages && !showSize) return null;
  return (
    <nav aria-label="Pages" className="pagination">
      {showPages && (
        <>
          <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>
            Previous
          </button>
          <span className="pagination__status">
            Page {page + 1} of {totalPages}
          </span>
          <button type="button" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)}>
            Next
          </button>
        </>
      )}
      {showSize && (
        <span className="pagination__size">
          <label htmlFor="page-size">Per page</label>
          <select
            id="page-size"
            value={PAGE_SIZES.includes(size) ? size : defaultSize}
            onChange={(event) => onSize(Number(event.target.value))}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </span>
      )}
    </nav>
  );
}
