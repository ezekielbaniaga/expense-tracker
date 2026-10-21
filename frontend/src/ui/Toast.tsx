import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface ToastApi {
  /** Shows an error message until dismissed. */
  showError(message: string): void;
  /** Shows a confirmation that hides itself after 4 s (paused on hover and focus). */
  showSuccess(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const SUCCESS_MS = 4000;

interface Toast {
  id: number;
  message: string;
  kind: "error" | "success";
}

/** Toasts in one live region: errors stay until dismissed, successes hide themselves. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = useCallback((kind: Toast["kind"], message: string) => {
    setToasts((current) => [...current, { id: Date.now() + Math.random(), message, kind }]);
  }, []);
  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);
  const api = useMemo<ToastApi>(
    () => ({
      showError: (message) => add("error", message),
      showSuccess: (message) => add("success", message),
    }),
    [add],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="region" aria-label="Notifications" className="toasts">
        {toasts.map((toast) =>
          toast.kind === "error" ? (
            <div key={toast.id} role="alert" className="toast toast--error">
              {toast.message}{" "}
              <button type="button" onClick={() => remove(toast.id)}>
                Dismiss
              </button>
            </div>
          ) : (
            <SuccessToast key={toast.id} id={toast.id} message={toast.message} onHide={remove} />
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}

function SuccessToast({ id, message, onHide }: { id: number; message: string; onHide: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onHide(id), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [paused, id, onHide]);
  return (
    <div
      role="status"
      className="toast toast--success"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {message}
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast needs a ToastProvider");
  return api;
}
