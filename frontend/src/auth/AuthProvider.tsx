import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ApiClient } from "../api/client";
import type { Identity, Role } from "../api/jwt";

/**
 * Who is signed in, as React sees it. The access token itself stays in the
 * API client's memory, out of React state, so a refresh re-renders only when
 * it changes the role or the user.
 */
export type AuthState =
  | { status: "booting"; role: null; username: null }
  | { status: "anonymous"; role: null; username: null }
  | { status: "authenticated"; role: Role | null; username: string };

export interface AuthContextValue {
  state: AuthState;
  /** The API client, for data calls (it attaches the token and refreshes on 401). */
  client: ApiClient;
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

function sameState(a: AuthState, b: AuthState): boolean {
  return a.status === b.status && a.role === b.role && a.username === b.username;
}

export function AuthProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(BOOTING);
  // The shown state, readable from the client's listeners without a stale closure
  const shown = useRef<AuthState>(BOOTING);

  const show = useCallback((next: AuthState) => {
    if (sameState(shown.current, next)) return;
    shown.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    // Every sign-out lands here: logout, a refresh 401, another tab. Clearing
    // the cache keeps the next person on this browser from seeing this one's data
    return client.onSignedOut(() => {
      queryClient.clear();
      show(ANONYMOUS);
    });
  }, [client, queryClient, show]);

  useEffect(() => {
    // Every new token lands here: boot, login and each later refresh, which
    // carries a promotion or a demotion. Subscribed before the boot refresh
    // below, so that is shown from here too. The cache stays for the same
    // user; after boot, another name (the shared cookie was signed in again
    // elsewhere) is a sign-in, so its data must not show this one's
    return client.onSession(() => {
      const next = stateFor(client.identity());
      const previous = shown.current;
      if (previous.status !== "booting" && previous.username !== next.username) queryClient.clear();
      show(next);
    });
  }, [client, queryClient, show]);

  useEffect(() => {
    // The refresh cookie is HttpOnly, so scripts cannot tell whether there is
    // a session: always try once. StrictMode's second run joins the same
    // single-flight refresh, so this still sends one request. A success is
    // shown by the session listener
    let active = true;
    client.refresh().catch(() => active && show(ANONYMOUS));
    return () => {
      active = false;
    };
  }, [client, show]);

  const login = useCallback(
    async (username: string, password: string) => {
      await client.login(username, password);
      // The session listener did this already; repeat it in case it was not subscribed
      queryClient.clear();
      show(stateFor(client.identity()));
    },
    [client, queryClient, show],
  );

  const logout = useCallback(async () => {
    await client.logout();
    // The signed-out listener did this already; repeat it in case it was not subscribed
    queryClient.clear();
    show(ANONYMOUS);
  }, [client, queryClient, show]);

  const value = useMemo(
    () => ({ state, client, login, logout }),
    [state, client, login, logout],
  );

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
