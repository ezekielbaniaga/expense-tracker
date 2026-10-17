import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";

/** The text under an input; pair it with errorProps(id, message) on the input. */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="field-error">
      {message}
    </p>
  );
}

/** aria-invalid and aria-describedby for an input whose FieldError is shown. */
export function errorProps(id: string, message: string | undefined) {
  return message
    ? ({ "aria-invalid": true, "aria-describedby": `${id}-error` } as const)
    : ({ "aria-invalid": undefined, "aria-describedby": undefined } as const);
}

/**
 * A form-level error. It takes focus when it appears after a failed submit,
 * unless a field already did (a server error on a field also sets this text).
 */
export function FormAlert(props: ComponentProps<"p">) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (document.activeElement?.getAttribute("aria-invalid") === "true") return;
    ref.current?.focus();
  }, []);
  return <p role="alert" tabIndex={-1} ref={ref} {...props} />;
}

/** A table that scrolls sideways on a narrow screen; the label names it for screen readers. */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
