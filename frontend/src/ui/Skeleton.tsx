/**
 * Pulsing placeholder blocks. The loading text stays in a role="status" region, visually
 * hidden, so screen readers and tests still get "Loading ..."; the blocks are decoration.
 * The pulse stops under prefers-reduced-motion (see base.css).
 */
export function Skeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div role="status" className="skeleton">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton__line" aria-hidden="true" />
      ))}
    </div>
  );
}
