import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, AppRoutes } from "../App";
import { createApiClient, type ApiClient } from "../api/client";
import { fakeJwt } from "../test/fakeJwt";

const BASE = "http://localhost";
// Signed-in pages load the expense list; these tests are not about it
const server = setupServer(
  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({ code: "AUTHENTICATION_REQUIRED", messages: [], timestamp: "x" }, { status: 401 }),
  ),
  http.get(`${BASE}/api/expense`, () => HttpResponse.json({ expenses: [], count: 0, total_amount: 0 })),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function error(status: number, code: string, messages: string[] = [code], headers: Record<string, string> = {}) {
  return HttpResponse.json({ code, messages, timestamp: "x" }, { status, headers });
}

const created = http.post(`${BASE}/auth/register`, () =>
  HttpResponse.json({ uniqueId: "u-1", username: "carol", role: "USER" }, { status: 201 }),
);

let client: ApiClient;
let queryClient: QueryClient;

beforeEach(() => {
  client = createApiClient({
    baseUrl: BASE,
    scheduler: () => () => {},
    locks: null,
    createChannel: null,
  });
  queryClient = new QueryClient();
});

afterEach(() => client.dispose());

async function renderRegister() {
  render(
    <AppProviders client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={["/register"]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
  await screen.findByRole("heading", { name: "Create account" });
}

function fillRegister(username: string, password: string) {
  fireEvent.input(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.input(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("register", () => {
  it("registers, then logs in with the same credentials and shows the home page", async () => {
    const calls: { path: string; body: unknown }[] = [];
    server.use(
      http.post(`${BASE}/auth/register`, async ({ request }) => {
        calls.push({ path: "register", body: await request.json() });
        return HttpResponse.json({ uniqueId: "u-1", username: "carol", role: "USER" }, { status: 201 });
      }),
      http.post(`${BASE}/auth/login`, async ({ request }) => {
        calls.push({ path: "login", body: await request.json() });
        return HttpResponse.json({
          accessToken: fakeJwt({ sub: "carol", role: "USER" }),
          accessTokenExpiresIn: 900,
          refreshTokenExpiresAt: "2026-11-17T00:00:00",
        });
      }),
    );
    await renderRegister();
    fillRegister("  carol ", "a-long-password");
    expect(await screen.findByRole("link", { name: "Expense Tracker" })).toBeTruthy();
    // The server strips the name too; logging in with the same text keeps the two in step
    expect(calls).toEqual([
      { path: "register", body: { username: "carol", password: "a-long-password" } },
      { path: "login", body: { username: "carol", password: "a-long-password" } },
    ]);
    expect(screen.getByText("carol")).toBeTruthy();
    expect(client.isSignedIn()).toBe(true);
  });

  it("shows USERNAME_TAKEN on the username field", async () => {
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        error(409, "USERNAME_TAKEN", ["Username is already taken."]),
      ),
    );
    await renderRegister();
    fillRegister("carol", "a-long-password");
    expect(await screen.findByText("Username is already taken")).toBeTruthy();
    expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows INVALID_USERNAME on the username field", async () => {
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        error(400, "INVALID_USERNAME", ["Username may only contain letters A-Z, digits, '.', '_' and '-'."]),
      ),
    );
    await renderRegister();
    fillRegister("carol", "a-long-password");
    expect(
      await screen.findByText("Username may only contain letters A-Z, digits, '.', '_' and '-'."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBe("true");
  });

  it("shows INVALID_PASSWORD on the password field", async () => {
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        error(400, "INVALID_PASSWORD", ["Password must not be the username."]),
      ),
    );
    await renderRegister();
    fillRegister("carol", "a-long-password");
    expect(await screen.findByText("Password must not be the username.")).toBeTruthy();
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("true");
  });

  it("puts VALIDATION_ERROR messages on their fields", async () => {
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        error(400, "VALIDATION_ERROR", ["password: must not be blank"]),
      ),
    );
    await renderRegister();
    fillRegister("carol", "a-long-password");
    expect(await screen.findByText("must not be blank")).toBeTruthy();
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("true");
  });

  it("shows a form-level message on 429, with the wait from Retry-After", async () => {
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        error(429, "TOO_MANY_REQUESTS", ["Too many requests"], { "Retry-After": "120" }),
      ),
    );
    await renderRegister();
    fillRegister("carol", "a-long-password");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many attempts, try again in 120 s",
    );
  });

  it("shows 'try again later' on 429 without Retry-After", async () => {
    server.use(http.post(`${BASE}/auth/register`, () => error(429, "TOO_MANY_REQUESTS")));
    await renderRegister();
    fillRegister("carol", "a-long-password");
    expect((await screen.findByRole("alert")).textContent).toBe("Too many attempts, try again later");
  });

  it("says the account exists when the login after it fails", async () => {
    server.use(created, http.post(`${BASE}/auth/login`, () => error(500, "INTERNAL_ERROR")));
    await renderRegister();
    fillRegister("carol", "a-long-password");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Account created, but signing in failed. Sign in to continue.",
    );
    expect(client.isSignedIn()).toBe(false);
  });

  it("links to and from the login page", async () => {
    await renderRegister();
    fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Create an account" }));
    expect(await screen.findByRole("heading", { name: "Create account" })).toBeTruthy();
  });
});

describe("register client validation", () => {
  let calls: number;
  beforeEach(() => {
    calls = 0;
    server.use(
      http.post(`${BASE}/auth/register`, () => {
        calls++;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
  });

  it("requires both fields", async () => {
    await renderRegister();
    fillRegister("  ", "");
    expect(await screen.findByText("Username is required")).toBeTruthy();
    expect(screen.getByText("Password is required")).toBeTruthy();
    expect(calls).toBe(0);
  });

  it("checks the username characters and length", async () => {
    await renderRegister();
    fillRegister("bad name", "a-long-password");
    expect(
      await screen.findByText("Username may only contain letters A-Z, digits, '.', '_' and '-'"),
    ).toBeTruthy();
    fillRegister("a".repeat(101), "a-long-password");
    expect(await screen.findByText("Username must be at most 100 characters")).toBeTruthy();
    expect(calls).toBe(0);
  });

  it("checks the password length in characters and in UTF-8 bytes", async () => {
    await renderRegister();
    fillRegister("carol", "elevenchars");
    expect(await screen.findByText("Password must be at least 12 characters")).toBeTruthy();
    // 25 characters, 75 bytes
    fillRegister("carol", "€".repeat(25));
    expect(await screen.findByText("Password must be at most 72 bytes")).toBeTruthy();
    expect(calls).toBe(0);
  });

  it("rejects a password equal to the username in any case", async () => {
    await renderRegister();
    fillRegister("Carol.Smith1", "carol.smith1");
    expect(await screen.findByText("Password must not be the username")).toBeTruthy();
    expect(calls).toBe(0);
  });

  it("accepts the limits themselves", async () => {
    server.use(http.post(`${BASE}/auth/login`, () => error(500, "INTERNAL_ERROR")));
    await renderRegister();
    // 12 characters; 72 bytes
    fillRegister("a".repeat(100), "€".repeat(24));
    await screen.findByRole("alert");
    expect(calls).toBe(1);
  });
});
