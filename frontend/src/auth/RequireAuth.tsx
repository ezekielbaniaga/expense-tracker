import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

/** The location RequireAuth saves, so login can send the person back. */
export interface FromState {
  from?: { pathname: string; search: string; hash: string };
}

/** Renders its children only when signed in; otherwise goes to /login with `from`. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status !== "authenticated") {
    const from = { pathname: location.pathname, search: location.search, hash: location.hash };
    return <Navigate to="/login" replace state={{ from } satisfies FromState} />;
  }
  return <>{children}</>;
}
