import { parseApiError } from "./errors";

/**
 * The fetch wrapper every API call goes through. It holds the access token in
 * memory only and keeps it fresh with the HttpOnly refresh cookie, which
 * scripts never see.
 *
 * Refresh rotates the cookie and the backend treats a second use of the old
 * one as reuse, revoking the session. So all refreshes in this client go
 * through one shared promise: ten calls that get a 401 at once send one
 * `POST /auth/refresh`. Other tabs share the cookie, so inside that promise the
 * refresh holds the Web Lock "refresh": tabs refresh one at a time, and a tab
 * that waited sends the cookie the previous tab just received.
 *
 * Signing out is announced as `signed-out` on the BroadcastChannel "auth", so
 * every other tab clears its token and leaves too.
 */

/** Login and refresh response (`LoginResponse`); in cookie mode it has no refreshToken. */
interface LoginResponseDto {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: string;
}

export interface SessionInfo {
  /** Seconds the new access token is valid. */
  accessTokenExpiresIn: number;
  /** The session's fixed end, UTC without offset; refresh does not move it. */
  refreshTokenExpiresAt: string;
}

/** Runs `fn` after `ms` and returns a function that cancels it. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

/** The part of `navigator.locks` the client uses. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** The part of `BroadcastChannel` the client uses. */
export interface AuthChannel {
  postMessage(data: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  close(): void;
}

export interface ApiClientOptions {
  /** Prefix for every path. Empty in the browser, where the proxy makes the API same-origin. */
  baseUrl?: string;
  scheduler?: Scheduler;
  /** Cross-tab refresh lock; defaults to `navigator.locks`. Null or absent: in-tab single flight only. */
  locks?: LockManagerLike | null;
  /** Opens the cross-tab channel; defaults to `new BroadcastChannel("auth")`. Null or absent: no broadcast. */
  createChannel?: (() => AuthChannel) | null;
}

export interface RequestOptions {
  method?: string;
  /** Sent as JSON. */
  body?: unknown;
  /** The `X-API-Version` header; always sent, default "1.0". */
  version?: string;
  signal?: AbortSignal;
}

export const DEFAULT_API_VERSION = "1.0";
/** Refresh this many seconds before the access token runs out. */
const REFRESH_AHEAD_SECONDS = 60;

const REFRESH_LOCK = "refresh";
const AUTH_CHANNEL = "auth";
const SIGNED_OUT = "signed-out";

function defaultLocks(): LockManagerLike | null {
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;
}

function defaultCreateChannel(): (() => AuthChannel) | null {
  return typeof BroadcastChannel === "undefined" ? null : () => new BroadcastChannel(AUTH_CHANNEL);
}

const defaultScheduler: Scheduler = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const scheduler = options.scheduler ?? defaultScheduler;
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  const createChannel =
    options.createChannel === undefined ? defaultCreateChannel() : options.createChannel;

  let accessToken: string | null = null;
  let refreshInFlight: Promise<void> | null = null;
  let cancelScheduledRefresh: (() => void) | null = null;
  const signedOutListeners = new Set<() => void>();

  function unschedule() {
    cancelScheduledRefresh?.();
    cancelScheduledRefresh = null;
  }

  function applySession(dto: LoginResponseDto): SessionInfo {
    accessToken = dto.accessToken;
    unschedule();
    const delaySeconds = Math.max(0, dto.accessTokenExpiresIn - REFRESH_AHEAD_SECONDS);
    cancelScheduledRefresh = scheduler(() => {
      cancelScheduledRefresh = null;
      // Failures are handled inside: 401/400 already signed out, anything else
      // leaves the session and the next 401 retries
      refresh().catch(() => {});
    }, delaySeconds * 1000);
    return {
      accessTokenExpiresIn: dto.accessTokenExpiresIn,
      refreshTokenExpiresAt: dto.refreshTokenExpiresAt,
    };
  }

  /** Forgets the access token and the scheduled refresh, without emitting. */
  function clearSession() {
    accessToken = null;
    unschedule();
  }

  function notifySignedOut() {
    clearSession();
    for (const listener of signedOutListeners) listener();
  }

  const channel = createChannel?.() ?? null;
  // Another tab signed out: clear here too, without broadcasting again
  channel?.addEventListener("message", (event) => {
    const data = event.data as { type?: unknown } | null;
    if (typeof data === "object" && data !== null && data.type === SIGNED_OUT) notifySignedOut();
  });

  /** Ends the session in this tab and tells the other tabs to leave too. */
  function signOut() {
    notifySignedOut();
    channel?.postMessage({ type: SIGNED_OUT });
  }

  function send(path: string, init: RequestInit, version: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("X-API-Version", version);
    return fetch(baseUrl + path, { ...init, headers, credentials: "same-origin" });
  }

  async function doRefresh(): Promise<void> {
    // No body: the browser sends the refresh cookie (and Origin, which the backend checks)
    const response = await send("/auth/refresh", { method: "POST" }, DEFAULT_API_VERSION);
    if (response.ok) {
      applySession((await response.json()) as LoginResponseDto);
      return;
    }
    const error = await parseApiError(response);
    // 401: revoked, expired, reused or disabled. 400: malformed. Both are final.
    // 429 and others keep the session; the caller sees retryAfter on the error
    if (response.status === 401 || response.status === 400) signOut();
    throw error;
  }

  /**
   * Refreshes the access token through the shared in-flight promise. Rejects
   * with an ApiError (signed out on 401/400; 429 carries retryAfter) or with
   * the fetch TypeError on a network error, which keeps the session.
   */
  function refresh(): Promise<void> {
    // The lock sits inside the shared promise, so a tab asks for it once per refresh
    const start = () => (locks ? locks.request(REFRESH_LOCK, doRefresh) : doRefresh());
    refreshInFlight ??= start().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function login(username: string, password: string): Promise<SessionInfo> {
    const response = await send(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Refresh-Token-Transport": "cookie" },
        body: JSON.stringify({ username, password }),
      },
      DEFAULT_API_VERSION,
    );
    if (!response.ok) throw await parseApiError(response);
    return applySession((await response.json()) as LoginResponseDto);
  }

  /**
   * Calls the API with the access token. On a 401 it refreshes (or joins the
   * refresh already running) and replays once; a second 401 signs out.
   * Resolves with the parsed JSON body, or undefined for an empty body.
   */
  async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    const version = opts.version ?? DEFAULT_API_VERSION;
    const attempt = () => {
      const headers = new Headers();
      if (accessToken !== null) headers.set("Authorization", `Bearer ${accessToken}`);
      const init: RequestInit = { method: opts.method ?? "GET", headers, signal: opts.signal };
      if (opts.body !== undefined) {
        headers.set("Content-Type", "application/json");
        init.body = JSON.stringify(opts.body);
      }
      return send(path, init, version);
    };

    const tokenUsed = accessToken;
    let response = await attempt();
    if (response.status === 401) {
      // A refresh that finished while this call was out already gave a new
      // token; refreshing again would only rotate the cookie for nothing
      if (accessToken === tokenUsed) await refresh();
      response = await attempt();
      if (response.status === 401) {
        const error = await parseApiError(response);
        signOut();
        throw error;
      }
    }
    if (!response.ok) throw await parseApiError(response);
    const text = await response.text();
    return (text === "" ? undefined : JSON.parse(text)) as T;
  }

  /**
   * Called when the session ends: refresh 401/400, a 401 after refreshing,
   * `signOut()`, or `signed-out` from another tab.
   */
  function onSignedOut(listener: () => void): () => void {
    signedOutListeners.add(listener);
    return () => signedOutListeners.delete(listener);
  }

  return {
    login,
    refresh,
    request,
    onSignedOut,
    clearSession,
    signOut,
    /** Closes the cross-tab channel; the client no longer hears other tabs. */
    dispose: () => channel?.close(),
    isSignedIn: () => accessToken !== null,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** The app's client. Its access token lives only in this module's memory. */
export const apiClient = createApiClient();
