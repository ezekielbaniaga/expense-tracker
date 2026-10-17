import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, AppRoutes } from "../App";
import { createApiClient, type ApiClient } from "../api/client";
import { fakeJwt } from "../test/fakeJwt";

const BASE = "http://localhost";
const server = setupServer(
  http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({
      accessToken: fakeJwt({ sub: "alice", role: "USER" }),
      accessTokenExpiresIn: 900,
      refreshTokenExpiresAt: "2026-11-17T00:00:00",
    }),
  ),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/users/me`, () =>
    HttpResponse.json({ id: "u-1", username: "alice", role: "USER", createdAt: "2026-01-02T03:04:05.678" }),
  ),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function error(status: number, code: string, messages: string[] = [code], headers: Record<string, string> = {}) {
  return HttpResponse.json({ code, messages, timestamp: "x" }, { status, headers });
}

const THIS_DEVICE = {
  id: "s-1",
  createdAt: "2026-10-01T08:00:00",
  lastUsedAt: "2026-10-18T09:05:03.123",
  expiresAt: "2026-10-31T08:00:00",
  userAgent: "Firefox on Linux",
  ipAddress: "10.0.0.1",
  current: true,
};
const PHONE = {
  id: "s-2",
  createdAt: "2026-09-20T12:00:00",
  lastUsedAt: "2026-10-10T07:30:00",
  expiresAt: "2026-10-20T12:00:00",
  userAgent: "Safari on iPhone",
  ipAddress: "10.0.0.2",
  current: false,
};

function sessions(list: unknown[]) {
  return http.get(`${BASE}/users/me/sessions`, () => HttpResponse.json(list));
}

let client: ApiClient;
let queryClient: QueryClient;

beforeEach(() => {
  client = createApiClient({
    baseUrl: BASE,
    scheduler: () => () => {},
    locks: null,
    createChannel: null,
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.dispose());

async function renderProfile() {
  render(
    <AppProviders client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={["/me"]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
  await screen.findByRole("heading", { name: "Profile" });
}

function changePassword(current: string, next: string) {
  fireEvent.input(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.input(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
}

describe("profile", () => {
  it("shows the user from /users/me and is linked from the header", async () => {
    server.use(sessions([THIS_DEVICE]));
    await renderProfile();
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(await within(profile).findByText("alice")).toBeTruthy();
    expect(within(profile).getByText("USER")).toBeTruthy();
    expect(within(profile).getByText("2026-01-02 03:04")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("href")).toBe("/me");
  });
});

describe("change password", () => {
  it("sends both passwords, then signs out and goes to login", async () => {
    let body: unknown = null;
    let logouts = 0;
    server.use(
      sessions([THIS_DEVICE]),
      http.post(`${BASE}/users/me/password`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`${BASE}/auth/logout`, () => {
        logouts++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderProfile();
    changePassword("old-password", "a-new-long-password");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(body).toEqual({ currentPassword: "old-password", newPassword: "a-new-long-password" });
    // The server ended every session; signing out clears this tab and the cookie
    expect(logouts).toBe(1);
    expect(client.isSignedIn()).toBe(false);
    expect(queryClient.getQueryData(["me"])).toBeUndefined();
    expect(screen.getByText(/Password changed/)).toBeTruthy();
  });

  it("puts INVALID_CURRENT_PASSWORD on the current password field", async () => {
    server.use(
      sessions([THIS_DEVICE]),
      http.post(`${BASE}/users/me/password`, () =>
        error(400, "INVALID_CURRENT_PASSWORD", ["Current password is incorrect."]),
      ),
    );
    await renderProfile();
    changePassword("wrong-password", "a-new-long-password");
    expect(await screen.findByText("Current password is incorrect")).toBeTruthy();
    expect(screen.getByLabelText("Current password").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("New password").getAttribute("aria-invalid")).toBeNull();
    expect(client.isSignedIn()).toBe(true);
  });

  it("puts INVALID_PASSWORD on the new password field", async () => {
    server.use(
      sessions([THIS_DEVICE]),
      http.post(`${BASE}/users/me/password`, () =>
        error(400, "INVALID_PASSWORD", ["Password must not be the username."]),
      ),
    );
    await renderProfile();
    changePassword("old-password", "a-new-long-password");
    expect(await screen.findByText("Password must not be the username.")).toBeTruthy();
    expect(screen.getByLabelText("New password").getAttribute("aria-invalid")).toBe("true");
  });

  it("shows 429 at form level with the Retry-After seconds", async () => {
    server.use(
      sessions([THIS_DEVICE]),
      http.post(`${BASE}/users/me/password`, () =>
        error(429, "TOO_MANY_REQUESTS", ["Too many requests."], { "Retry-After": "300" }),
      ),
    );
    await renderProfile();
    changePassword("wrong-password", "a-new-long-password");
    const form = screen.getByRole("form", { name: "Change password" });
    expect((await within(form).findByRole("alert")).textContent).toBe("Too many attempts, try again in 300 s");
    expect(screen.getByLabelText("Current password").getAttribute("aria-invalid")).toBeNull();
  });

  it("checks the backend's rules before sending anything", async () => {
    let calls = 0;
    server.use(
      sessions([THIS_DEVICE]),
      http.post(`${BASE}/users/me/password`, () => {
        calls++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderProfile();
    changePassword("", "short");
    expect(await screen.findByText("Current password is required")).toBeTruthy();
    expect(screen.getByText("Password must be at least 12 characters")).toBeTruthy();

    // 24 three-byte characters: 24 long, 72 bytes is the limit, so one more is over
    changePassword("old-password", "€".repeat(25));
    expect(await screen.findByText("Password must be at most 72 bytes")).toBeTruthy();
    expect(calls).toBe(0);
  });

  it("rejects the username as the new password, ignoring case", async () => {
    server.use(
      sessions([THIS_DEVICE]),
      http.get(`${BASE}/users/me`, () =>
        HttpResponse.json({ id: "u-1", username: "alice.long-name", role: "USER", createdAt: "2026-01-02T03:04:05" }),
      ),
      http.post(`${BASE}/auth/refresh`, () =>
        HttpResponse.json({
          accessToken: fakeJwt({ sub: "alice.long-name", role: "USER" }),
          accessTokenExpiresIn: 900,
          refreshTokenExpiresAt: "2026-11-17T00:00:00",
        }),
      ),
    );
    await renderProfile();
    changePassword("old-password", "Alice.Long-Name");
    expect(await screen.findByText("Password must not be the username")).toBeTruthy();
  });
});

describe("your devices", () => {
  it("lists the sessions and marks this device", async () => {
    server.use(sessions([THIS_DEVICE, PHONE]));
    await renderProfile();
    const list = await screen.findByRole("list", { name: "Your devices" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Firefox on Linux")).toBeTruthy();
    expect(within(items[0]).getByText("This device")).toBeTruthy();
    expect(within(items[0]).getByText(/10\.0\.0\.1/)).toBeTruthy();
    expect(within(items[0]).getByText(/2026-10-18 09:05/)).toBeTruthy();
    expect(within(items[1]).getByText("Safari on iPhone")).toBeTruthy();
    expect(within(items[1]).queryByText("This device")).toBeNull();
  });

  it("revokes another device after confirming, and refetches the list", async () => {
    let revoked: string | null = null;
    let listCalls = 0;
    server.use(
      http.get(`${BASE}/users/me/sessions`, () => {
        listCalls++;
        return HttpResponse.json(revoked === null ? [THIS_DEVICE, PHONE] : [THIS_DEVICE]);
      }),
      http.delete(`${BASE}/users/me/sessions/:id`, ({ params }) => {
        revoked = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderProfile();
    const phone = (await screen.findByText("Safari on iPhone")).closest("li")!;
    fireEvent.click(within(phone as HTMLElement).getByRole("button", { name: "Revoke" }));
    // Nothing is sent until the inline confirm
    expect(revoked).toBeNull();
    fireEvent.click(within(phone as HTMLElement).getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(screen.queryByText("Safari on iPhone")).toBeNull());
    expect(revoked).toBe("s-2");
    expect(listCalls).toBe(2);
    expect(client.isSignedIn()).toBe(true);
  });

  it("cancel keeps the device", async () => {
    let calls = 0;
    server.use(
      sessions([THIS_DEVICE, PHONE]),
      http.delete(`${BASE}/users/me/sessions/:id`, () => {
        calls++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderProfile();
    const phone = (await screen.findByText("Safari on iPhone")).closest("li") as HTMLElement;
    fireEvent.click(within(phone).getByRole("button", { name: "Revoke" }));
    fireEvent.click(within(phone).getByRole("button", { name: "Cancel" }));
    expect(within(phone).getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(calls).toBe(0);
  });

  it("revoking this device signs out like logout", async () => {
    let revoked: string | null = null;
    let logouts = 0;
    server.use(
      sessions([THIS_DEVICE, PHONE]),
      http.delete(`${BASE}/users/me/sessions/:id`, ({ params }) => {
        revoked = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(`${BASE}/auth/logout`, () => {
        logouts++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderProfile();
    const mine = (await screen.findByText("Firefox on Linux")).closest("li") as HTMLElement;
    fireEvent.click(within(mine).getByRole("button", { name: "Revoke" }));
    expect(within(mine).getByText(/signs you out/)).toBeTruthy();
    fireEvent.click(within(mine).getByRole("button", { name: "Confirm revoke" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(revoked).toBe("s-1");
    expect(logouts).toBe(1);
    expect(client.isSignedIn()).toBe(false);
  });

  it("signs out the other devices after confirming and says how many", async () => {
    let bulk = 0;
    server.use(
      http.get(`${BASE}/users/me/sessions`, () =>
        HttpResponse.json(bulk === 0 ? [THIS_DEVICE, PHONE] : [THIS_DEVICE]),
      ),
      http.delete(`${BASE}/users/me/sessions`, () => {
        bulk++;
        return HttpResponse.json({ revoked: 1 });
      }),
    );
    await renderProfile();
    await screen.findByText("Safari on iPhone");
    fireEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));
    expect(bulk).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));
    expect((await screen.findByRole("status")).textContent).toBe("Signed out 1 other device.");
    await waitFor(() => expect(screen.queryByText("Safari on iPhone")).toBeNull());
    expect(bulk).toBe(1);
    expect(client.isSignedIn()).toBe(true);
  });

  it("offers no bulk sign out when this is the only device", async () => {
    server.use(sessions([THIS_DEVICE]));
    await renderProfile();
    await screen.findByText("Firefox on Linux");
    expect(screen.queryByRole("button", { name: "Sign out other devices" })).toBeNull();
  });

  it("shows a revoke failure on the row and keeps the device", async () => {
    server.use(
      sessions([THIS_DEVICE, PHONE]),
      http.delete(`${BASE}/users/me/sessions/:id`, () => error(500, "INTERNAL_ERROR", ["Boom."])),
    );
    await renderProfile();
    const phone = (await screen.findByText("Safari on iPhone")).closest("li") as HTMLElement;
    fireEvent.click(within(phone).getByRole("button", { name: "Revoke" }));
    fireEvent.click(within(phone).getByRole("button", { name: "Confirm revoke" }));
    expect((await within(phone).findByRole("alert")).textContent).toMatch(/Could not revoke/);
    expect(within(phone).getByText("Safari on iPhone")).toBeTruthy();
  });
});
