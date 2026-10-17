import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ApiClient } from "../api/client";
import type { Identity, Role } from "../api/jwt";

/**
 * Who is signed in, as React sees it. The access token itself stays in the
 * API client's memory, out of React state, so a refresh does not re-render.
 */
export type AuthState =
  | { status: "booting"; role: null; username: null }
  | { status: "anonymous"; role: null; username: null }
  | { status: "authenticated"; role: Role | null; username: string };

export interface AuthContextValue {
  state: AuthState;
  /** Rejects with the ApiError from `/auth/login`; the page shows it. */
  login(username: string, password: string): Promise<void>;
  /** Never rejects: the client is cleared whatever the server says. */
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BOOTING: AuthState = { status: "booting", role: null, username: null };
const ANONYMOUS: AuthState = { status: "anonymous", role: null, username: null };

function stateFor(identity: Identity | null): AuthState {
  // A token we cannot read still works for the API; show it without a name
  return identity === null
    ? { status: "authenticated", role: null, username: "" }
    : { status: "authenticated", role: identity.role, username: identity.username };
}

export function AuthProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(BOOTING);

  useEffect(() => {
    // Every sign-out lands here: logout, a refresh 401, another tab. Clearing
    // the cache keeps the next person on this browser from seeing this one's data
    return client.onSignedOut(() => {
      queryClient.clear();
      setState(ANONYMOUS);
    });
  }, [client, queryClient]);

  useEffect(() => {
    // The refresh cookie is HttpOnly, so scripts cannot tell whether there is
    // a session: always try once. StrictMode's second run joins the same
    // single-flight refresh, so this still sends one request
    let active = true;
    client.refresh().then(
      () => active && setState(stateFor(client.identity())),
      () => active && setState(ANONYMOUS),
    );
    return () => {
      active = false;
    };
  }, [client]);

  const login = useCallback(
    async (username: string, password: string) => {
      await client.login(username, password);
      queryClient.clear();
      setState(stateFor(client.identity()));
    },
    [client, queryClient],
  );

  const logout = useCallback(async () => {
    await client.logout();
    // The signed-out listener did this already; repeat it in case it was not subscribed
    queryClient.clear();
    setState(ANONYMOUS);
  }, [client, queryClient]);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {state.status === "booting" ? (
        <p role="status" className="splash">
          Loading…
        </p>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
