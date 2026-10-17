import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createApiClient, type ApiClient, type Scheduler } from "./client";
import { ApiError } from "./errors";

const BASE = "http://localhost";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function session(accessToken: string, accessTokenExpiresIn = 900) {
  return { accessToken, accessTokenExpiresIn, refreshTokenExpiresAt: "2026-11-17T00:00:00" };
}

function error(status: number, code: string, headers: Record<string, string> = {}) {
  return HttpResponse.json({ code, messages: [code], timestamp: "x" }, { status, headers });
}

/** Records scheduled callbacks instead of running them, so no timer handles leak. */
function fakeScheduler() {
  const pending: { ms: number; fire: () => void; done: boolean }[] = [];
  const scheduler: Scheduler = (fn, ms) => {
    const entry = {
      ms,
      done: false,
      fire: () => {
        entry.done = true;
        fn();
      },
    };
    pending.push(entry);
    return () => {
      entry.done = true;
    };
  };
  const active = () => pending.filter((e) => !e.done);
  return { scheduler, active };
}

/** Counts refreshes; each one rotates to token "fresh-N". */
function refreshHandler(counter: { n: number }, respond?: () => Response | Promise<Response>) {
  return http.post(`${BASE}/auth/refresh`, async ({ request }) => {
    counter.n++;
    expect(await request.text()).toBe("");
    if (respond) return respond();
    return HttpResponse.json(session(`fresh-${counter.n}`));
  });
}

/** 401 unless the Bearer token is a refreshed one. */
function protectedHandler(calls: { n: number }) {
  return http.get(`${BASE}/api/expenses`, ({ request }) => {
    calls.n++;
    const auth = request.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer fresh-")) return error(401, "AUTHENTICATION_REQUIRED");
    return HttpResponse.json({ ok: true, version: request.headers.get("X-API-Version") });
  });
}

let client: ApiClient;
let timers: ReturnType<typeof fakeScheduler>;

beforeEach(() => {
  timers = fakeScheduler();
  client = createApiClient({ baseUrl: BASE, scheduler: timers.scheduler });
});

afterEach(() => client.clearSession());

describe("login", () => {
  it("asks for the cookie transport and keeps the access token for later calls", async () => {
    let transport: string | null = null;
    let seenAuth: string | null = null;
    server.use(
      http.post(`${BASE}/auth/login`, ({ request }) => {
        transport = request.headers.get("X-Refresh-Token-Transport");
        return HttpResponse.json(session("fresh-login"));
      }),
      http.get(`${BASE}/api/expenses`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        return HttpResponse.json({ ok: true });
      }),
    );

    const result = await client.login("alice", "secret-password");
    expect(transport).toBe("cookie");
    expect(result.accessTokenExpiresIn).toBe(900);
    expect(result.refreshTokenExpiresAt).toBe("2026-11-17T00:00:00");

    await client.request("/api/expenses", { version: "1.2" });
    expect(seenAuth).toBe("Bearer fresh-login");
  });

  it("rejects with the parsed ApiError on bad credentials", async () => {
    server.use(http.post(`${BASE}/auth/login`, () => error(401, "INVALID_CREDENTIALS")));
    await expect(client.login("alice", "wrong")).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
  });
});

describe("request", () => {
  it("always sends an explicit X-API-Version", async () => {
    const versions: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/api/expenses`, ({ request }) => {
        versions.push(request.headers.get("X-API-Version"));
        return HttpResponse.json({});
      }),
    );
    await client.request("/api/expenses");
    await client.request("/api/expenses", { version: "1.2" });
    expect(versions).toEqual(["1.0", "1.2"]);
  });

  it("sends JSON bodies and returns undefined for 204", async () => {
    let body: unknown;
    let contentType: string | null = null;
    server.use(
      http.post(`${BASE}/api/expenses`, async ({ request }) => {
        contentType = request.headers.get("Content-Type");
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const result = await client.request("/api/expenses", { method: "POST", body: { amount: 5 } });
    expect(result).toBeUndefined();
    expect(contentType).toBe("application/json");
    expect(body).toEqual({ amount: 5 });
  });

  it("rejects other errors with the parsed ApiError and no refresh", async () => {
    const refreshes = { n: 0 };
    server.use(
      refreshHandler(refreshes),
      http.get(`${BASE}/api/expenses/1`, () => error(404, "NOT_FOUND")),
    );
    await expect(client.request("/api/expenses/1")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(refreshes.n).toBe(0);
  });
});

describe("refresh on 401", () => {
  it("ten parallel 401s share one refresh, and each replays once", async () => {
    const refreshes = { n: 0 };
    const calls = { n: 0 };
    server.use(refreshHandler(refreshes), protectedHandler(calls));

    const results = await Promise.all(
      Array.from({ length: 10 }, () => client.request<{ ok: boolean }>("/api/expenses")),
    );

    expect(results.every((r) => r.ok)).toBe(true);
    expect(refreshes.n).toBe(1);
    expect(calls.n).toBe(20);
  });

  it("replays only once: a second 401 means signed out", async () => {
    const refreshes = { n: 0 };
    let calls = 0;
    const signedOut = vi.fn();
    client.onSignedOut(signedOut);
    server.use(
      refreshHandler(refreshes),
      http.get(`${BASE}/api/expenses`, () => {
        calls++;
        return error(401, "AUTHENTICATION_REQUIRED");
      }),
    );

    await expect(client.request("/api/expenses")).rejects.toMatchObject({ status: 401 });
    expect(refreshes.n).toBe(1);
    expect(calls).toBe(2);
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it("a refresh 401 emits signed-out once and rejects every waiting call", async () => {
    const refreshes = { n: 0 };
    const calls = { n: 0 };
    const signedOut = vi.fn();
    client.onSignedOut(signedOut);
    server.use(
      refreshHandler(refreshes, () => error(401, "AUTHENTICATION_REQUIRED")),
      protectedHandler(calls),
    );

    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => client.request("/api/expenses")),
    );

    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(refreshes.n).toBe(1);
    expect(calls.n).toBe(3);
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it("a refresh 400 also signs out", async () => {
    const signedOut = vi.fn();
    client.onSignedOut(signedOut);
    server.use(refreshHandler({ n: 0 }, () => error(400, "VALIDATION_ERROR")));
    await expect(client.refresh()).rejects.toMatchObject({ status: 400 });
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it("a refresh 429 keeps the session and rejects with retryAfter", async () => {
    const signedOut = vi.fn();
    client.onSignedOut(signedOut);
    server.use(
      http.post(`${BASE}/auth/login`, () => HttpResponse.json(session("old"))),
      refreshHandler({ n: 0 }, () => error(429, "TOO_MANY_REQUESTS", { "Retry-After": "30" })),
      protectedHandler({ n: 0 }),
    );
    await client.login("alice", "secret-password");

    const err = await client.request("/api/expenses").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).retryAfter).toBe(30);
    expect(signedOut).not.toHaveBeenCalled();
    expect(client.isSignedIn()).toBe(true);
  });

  it("a network error during refresh keeps the session", async () => {
    const signedOut = vi.fn();
    client.onSignedOut(signedOut);
    server.use(
      http.post(`${BASE}/auth/login`, () => HttpResponse.json(session("old"))),
      refreshHandler({ n: 0 }, () => HttpResponse.error()),
      protectedHandler({ n: 0 }),
    );
    await client.login("alice", "secret-password");

    await expect(client.request("/api/expenses")).rejects.toBeInstanceOf(TypeError);
    expect(signedOut).not.toHaveBeenCalled();
    expect(client.isSignedIn()).toBe(true);
  });

  it("a later refresh is a new request once the previous one settled", async () => {
    const refreshes = { n: 0 };
    server.use(refreshHandler(refreshes));
    await client.refresh();
    await client.refresh();
    expect(refreshes.n).toBe(2);
  });
});

describe("early refresh", () => {
  it("schedules a refresh accessTokenExpiresIn - 60 seconds after each success", async () => {
    const refreshes = { n: 0 };
    server.use(
      http.post(`${BASE}/auth/login`, () => HttpResponse.json(session("fresh-login", 900))),
      refreshHandler(refreshes),
    );

    await client.login("alice", "secret-password");
    expect(timers.active()).toHaveLength(1);
    expect(timers.active()[0].ms).toBe(840_000);

    // Fire it alongside a manual refresh: still one request, through the same single flight
    const manual = client.refresh();
    timers.active()[0].fire();
    await manual;
    expect(refreshes.n).toBe(1);

    // The success replaced the old timer with a new one
    expect(timers.active()).toHaveLength(1);
  });

  it("signing out cancels the scheduled refresh", async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () => HttpResponse.json(session("fresh-login", 30))),
    );
    await client.login("alice", "secret-password");
    expect(timers.active()[0].ms).toBe(0);
    client.clearSession();
    expect(timers.active()).toHaveLength(0);
    expect(client.isSignedIn()).toBe(false);
  });
});
