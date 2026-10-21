export const PAGE_SIZES = [10, 20, 50, 100];

interface PaginationProps {
  /** Zero-based current page. */
  page: number;
  totalPages: number;
  size: number;
  /** The size shown when `size` is not one of the offered ones. */
  defaultSize: number;
  /** Both buttons are disabled until there is data to page through. */
  disabled?: boolean;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}

/** Previous / Next, "Page x of y" and a page-size select. */
export function Pagination({ page, totalPages, size, defaultSize, disabled, onPage, onSize }: PaginationProps) {
  return (
    <nav aria-label="Pages" className="pagination">
      <button type="button" disabled={disabled || page === 0} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="pagination__status">
        Page {page + 1} of {Math.max(totalPages, 1)}
      </span>
      <button type="button" disabled={disabled || page + 1 >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
      <label htmlFor="page-size">Page size</label>
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
    </nav>
  );
}
