import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A modal confirm on the native <dialog>. It is mounted only while it is wanted,
 * so it opens on mount; Escape ("cancel") and the Cancel button both call
 * `onClose`. Put `data-autofocus` on the control that should take focus first
 * (the safe one). Returning focus to the opener is the caller's job.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // The caller unmounts the dialog; the browser must not close it first
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
