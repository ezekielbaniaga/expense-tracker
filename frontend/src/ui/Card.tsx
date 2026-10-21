import type { ReactNode } from "react";

/** Surface with radius and padding; an optional caps title. */
export function Card({ title, className, children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={["card", className].filter(Boolean).join(" ")}>
      {title && <h2 className="card__title">{title}</h2>}
      {children}
    </div>
  );
}
