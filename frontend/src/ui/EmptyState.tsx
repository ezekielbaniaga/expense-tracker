import type { ReactNode } from "react";

/** Small illustration in the accent fill, a headline, one line of text and an optional action. */
export function EmptyState({
  title,
  children,
  action,
  headline,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Renders the title in place of the default paragraph, e.g. a PageHeading that takes focus. */
  headline?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <svg className="empty-state__art" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="currentColor" opacity="0.25" />
        <rect x="18" y="20" width="28" height="24" rx="4" fill="currentColor" />
        <rect x="23" y="27" width="18" height="3" rx="1.5" fill="var(--surface)" />
        <rect x="23" y="34" width="11" height="3" rx="1.5" fill="var(--surface)" />
      </svg>
      {headline ?? <p className="empty-state__title">{title}</p>}
      {children && <p className="empty-state__text">{children}</p>}
      {action}
    </div>
  );
}
