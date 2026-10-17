import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

/**
 * Renders its children only when the token's role is ADMIN; anyone else goes
 * to the expense list, like an unknown route. This only hides the screen: the
 * server checks the role on every call, and a demoted admin's token can still
 * say ADMIN for a while, so the admin pages handle its 403 too.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}
