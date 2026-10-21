import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppProviders, AppRoutes } from "../App";
import { createApiClient, type ApiClient } from "../api/client";
import { fakeJwt } from "../test/fakeJwt";
import { LoginPage } from "./LoginPage";
import { RequireAuth } from "./RequireAuth";

const BASE = "http://localhost";
// Signed-in pages load the expense list; these tests are not about it
const server = setupServer(
  http.get("http://localhost/api/expense", () =>
    HttpResponse.json({ expenses: [], count: 0, total_amount: 0 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function session(username: string, role: string) {
  return {
    accessToken: fakeJwt({ sub: username, role }),
    accessTokenExpiresIn: 900,
    refreshTokenExpiresAt: "2026-11-17T00:00:00",
  };
}

function error(status: number, code: string, headers: Record<string, string> = {}) {
  return HttpResponse.json({ code, messages: [code], timestamp: "x" }, { status, headers });
}

const noSession = http.post(`${BASE}/auth/refresh`, () => error(401, "AUTHENTICATION_REQUIRED"));
const withSession = http.post(`${BASE}/auth/refresh`, () =>
  HttpResponse.json(session("alice", "ADMIN")),
);

let client: ApiClient;
let queryClient: QueryClient;

beforeEach(() => {
  // A scheduler that never fires, so no refresh timer outlives a test
  client = createApiClient({
    baseUrl: BASE,
    scheduler: () => () => {},
    locks: null,
    createChannel: null,
  });
  queryClient = new QueryClient();
});

afterEach(() => client.dispose());

function renderApp(path = "/", routes: ReactNode = <AppRoutes />) {
  return render(
    <AppProviders client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>{routes}</MemoryRouter>
    </AppProviders>,
  );
}

function fillLogin(username: string, password: string) {
  fireEvent.input(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.input(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

/** The account menu names the user on its button and shows the role when opened (it is closed again after). */
function expectAccount(username: string, role?: string) {
  const button = screen.getByRole("button", { name: `Account menu for ${username}` });
  if (!role) return;
  fireEvent.click(button);
  expect(screen.getByRole("region", { name: username }).textContent).toContain(role);
  fireEvent.click(button);
}

describe("boot", () => {
  it("shows a splash, then the home page when the cookie still has a session", async () => {
    server.use(withSession);
    renderApp("/");
    expect(screen.getByRole("status").textContent).toMatch(/loading/i);
    expect(await screen.findByRole("link", { name: "Expense Tracker" })).toBeTruthy();
    expectAccount("alice", "ADMIN");
  });

  it("shows the login page when there is no session", async () => {
    server.use(noSession);
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(client.isSignedIn()).toBe(false);
  });

  it("refreshes exactly once", async () => {
    let refreshes = 0;
    server.use(
      http.post(`${BASE}/auth/refresh`, () => {
        refreshes++;
        return HttpResponse.json(session("alice", "USER"));
      }),
    );
    renderApp("/");
    await screen.findByRole("link", { name: "Expense Tracker" });
    expect(refreshes).toBe(1);
  });
});

describe("login", () => {
  it("signs in, clears the Query cache and shows the home page", async () => {
    let body: unknown;
    server.use(
      noSession,
      http.post(`${BASE}/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(session("bob", "USER"));
      }),
    );
    renderApp("/login");
    await screen.findByRole("heading", { name: "Sign in" });
    queryClient.setQueryData(["expenses"], ["someone else's"]);
    fillLogin("bob", "secret-password");
    expect(await screen.findByRole("link", { name: "Expense Tracker" })).toBeTruthy();
    expect(body).toEqual({ username: "bob", password: "secret-password" });
    expectAccount("bob", "USER");
    expect(queryClient.getQueryData(["expenses"])).toBeUndefined();
  });

  it("shows a generic message on 401", async () => {
    server.use(
      noSession,
      http.post(`${BASE}/auth/login`, () => error(401, "INVALID_CREDENTIALS")),
    );
    renderApp("/login");
    await screen.findByRole("heading", { name: "Sign in" });
    fillLogin("bob", "wrong");
    expect((await screen.findByRole("alert")).textContent).toBe("Invalid username or password");
  });

  it("shows the wait from Retry-After on 429", async () => {
    server.use(
      noSession,
      http.post(`${BASE}/auth/login`, () =>
        error(429, "TOO_MANY_REQUESTS", { "Retry-After": "42" }),
      ),
    );
    renderApp("/login");
    await screen.findByRole("heading", { name: "Sign in" });
    fillLogin("bob", "wrong");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many attempts, try again in 42 s",
    );
  });

  it("requires both fields before calling the server", async () => {
    let calls = 0;
    server.use(
      noSession,
      http.post(`${BASE}/auth/login`, () => {
        calls++;
        return HttpResponse.json(session("bob", "USER"));
      }),
    );
    renderApp("/login");
    await screen.findByRole("heading", { name: "Sign in" });
    fillLogin("  ", "");
    expect(await screen.findByText("Username is required")).toBeTruthy();
    expect(screen.getByText("Password is required")).toBeTruthy();
    expect(calls).toBe(0);
  });
});

describe("RequireAuth", () => {
  function Where() {
    const location = useLocation();
    return <p>at {location.pathname + location.search}</p>;
  }

  const routes = (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/private"
        element={
          <RequireAuth>
            <Where />
          </RequireAuth>
        }
      />
    </Routes>
  );

  it("sends an anonymous visitor to /login and back to where they were after signing in", async () => {
    server.use(
      noSession,
      http.post(`${BASE}/auth/login`, () => HttpResponse.json(session("bob", "USER"))),
    );
    renderApp("/private?page=2", routes);
    await screen.findByRole("heading", { name: "Sign in" });
    fillLogin("bob", "secret-password");
    expect(await screen.findByText("at /private?page=2")).toBeTruthy();
  });

  it("lets a signed-in user through", async () => {
    server.use(withSession);
    renderApp("/private", routes);
    expect(await screen.findByText("at /private")).toBeTruthy();
  });
});

describe("logout", () => {
  it("clears the token and the Query cache even when logout returns 500", async () => {
    let logouts = 0;
    server.use(
      withSession,
      http.post(`${BASE}/auth/logout`, () => {
        logouts++;
        return error(500, "INTERNAL_ERROR");
      }),
    );
    renderApp("/");
    await screen.findByRole("link", { name: "Expense Tracker" });
    queryClient.setQueryData(["expenses"], ["alice's"]);
    fireEvent.click(screen.getByRole("button", { name: /^Account menu for / }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(logouts).toBe(1);
    expect(client.isSignedIn()).toBe(false);
    expect(queryClient.getQueryData(["expenses"])).toBeUndefined();
  });

  it("a sign-out from elsewhere (refresh 401, another tab) also lands on /login", async () => {
    server.use(withSession);
    renderApp("/");
    await screen.findByRole("link", { name: "Expense Tracker" });
    queryClient.setQueryData(["expenses"], ["alice's"]);
    client.signOut();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    await waitFor(() => expect(queryClient.getQueryData(["expenses"])).toBeUndefined());
  });
});

describe("refresh after boot", () => {
  function refreshAs(username: string, role: string) {
    return http.post(`${BASE}/auth/refresh`, () => HttpResponse.json(session(username, role)));
  }

  it("shows a promotion from the next refresh without a reload", async () => {
    server.use(refreshAs("alice", "USER"));
    renderApp("/");
    await screen.findByRole("link", { name: "Expense Tracker" });
    expectAccount("alice", "USER");
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();

    server.use(refreshAs("alice", "ADMIN"));
    await act(() => client.refresh());
    expectAccount("alice", "ADMIN");
    expect(screen.getByRole("link", { name: "Admin" })).toBeTruthy();
  });

  it("hides the Admin link when a refresh brings a USER token", async () => {
    server.use(withSession);
    renderApp("/");
    await screen.findByRole("link", { name: "Expense Tracker" });
    expect(screen.getByRole("link", { name: "Admin" })).toBeTruthy();

    server.use(refreshAs("alice", "USER"));
    await act(() => client.refresh());
    expectAccount("alice", "USER");
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("keeps the Query cache when the refresh is for the same user", async () => {
    server.use(withSession);
    renderApp("/");
    await screen.findByRole("link", { name: "Expense Tracker" });
    queryClient.setQueryData(["probe"], ["alice's"]);

    server.use(refreshAs("alice", "USER"));
    await act(() => client.refresh());
    expectAccount("alice", "USER");
    expect(queryClient.getQueryData(["probe"])).toEqual(["alice's"]);
  });

  it("clears the Query cache when the refresh names another user", async () => {
    // The cookie is shared, so another tab signing in as bob makes this tab's next refresh bob's
    server.use(withSession);
    renderApp("/");
    await screen.findByRole("link", { name: "Expense Tracker" });
    queryClient.setQueryData(["probe"], ["alice's"]);

    server.use(refreshAs("bob", "USER"));
    await act(() => client.refresh());
    expectAccount("bob");
    expect(queryClient.getQueryData(["probe"])).toBeUndefined();
  });
});
