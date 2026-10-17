import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface ToastApi {
  /** Shows an error message until dismissed. */
  showError(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

interface Toast {
  id: number;
  message: string;
}

/** Minimal toasts: a live region with dismissible error messages. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showError = useCallback((message: string) => {
    setToasts((current) => [...current, { id: Date.now() + Math.random(), message }]);
  }, []);
  const api = useMemo(() => ({ showError }), [showError]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-label="Notifications">
        {toasts.map((toast) => (
          <div key={toast.id} role="alert">
            {toast.message}{" "}
            <button
              type="button"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast needs a ToastProvider");
  return api;
}
