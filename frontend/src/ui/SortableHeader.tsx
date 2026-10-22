import { SortDownIcon, SortUpIcon } from "./icons";

export type SortDirection = "asc" | "desc";

interface SortableHeaderProps {
  /** Column name; also the button's accessible name. */
  label: string;
  /** Lowercase name used in the announcement, e.g. "amount". */
  announceName?: string;
  active: boolean;
  direction: SortDirection;
  /** Phrases for the announcement, e.g. "lowest first" and "highest first". */
  phrases: { asc: string; desc: string };
  onSort: () => void;
  /** Extra class on the `th`, for column-specific styling. */
  className?: string;
}

/**
 * A column header that sorts. Only the active column carries `aria-sort`; the button is named by
 * the column alone, and a polite live region announces the new order after a click.
 */
export function SortableHeader({
  label,
  announceName,
  active,
  direction,
  phrases,
  onSort,
  className,
}: SortableHeaderProps) {
  const name = announceName ?? label.toLowerCase();
  return (
    <th
      className={className}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
    >
      <button type="button" className="sort-header" onClick={onSort}>
        {label}
        {active && (direction === "asc" ? <SortUpIcon size={16} /> : <SortDownIcon size={16} />)}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {active ? `Sorted by ${name}, ${phrases[direction]}` : ""}
      </span>
    </th>
  );
}
