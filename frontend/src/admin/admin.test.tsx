import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, AppRoutes } from "../App";
import { createApiClient, type ApiClient } from "../api/client";
import type { AdminUserDto } from "../api/user";
import { fakeJwt } from "../test/fakeJwt";

const BASE = "http://localhost";

function refreshAs(role: string) {
  return http.post(`${BASE}/auth/refresh`, () =>
    HttpResponse.json({
      accessToken: fakeJwt({ sub: "alice", role }),
      accessTokenExpiresIn: 900,
      refreshTokenExpiresAt: "2026-11-17T00:00:00",
    }),
  );
}

const server = setupServer(
  refreshAs("ADMIN"),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function error(status: number, code: string, messages: string[] = [code]) {
  return HttpResponse.json({ code, messages, timestamp: "x" }, { status });
}

const ALICE: AdminUserDto = {
  id: "u-1",
  username: "alice",
  role: "ADMIN",
  enabled: true,
  version: 0,
  createdAt: "2026-01-02T03:04:05.678",
  lastModified: null,
};
const BOB: AdminUserDto = {
  id: "u-2",
  username: "bob",
  role: "USER",
  enabled: true,
  version: 3,
  createdAt: "2026-02-03T04:05:06",
  lastModified: "2026-10-01T10:00:00",
};

function page(users: AdminUserDto[], p = 0, size = 20, total = users.length) {
  return { users, page: p, size, total, totalPages: Math.ceil(total / size) };
}

/** GET /users/{id} answering with `user`; `next` replaces it after the first call. */
function getUser(user: AdminUserDto, next?: AdminUserDto) {
  let calls = 0;
  return http.get(`${BASE}/users/${user.id}`, () => HttpResponse.json(calls++ === 0 || !next ? user : next));
}

/** PATCH /users/{id} that records each body and answers with `respond`. */
function patchUser(id: string, bodies: unknown[], respond: (body: Record<string, unknown>) => Response) {
  return http.patch(`${BASE}/users/${id}`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    bodies.push(body);
    return respond(body);
  });
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

function renderAt(path: string) {
  render(
    <AppProviders client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

/** The text of the <dd> after the <dt> named `term`. */
function detail(term: string): string | null | undefined {
  const dl = document.querySelector("dl") as HTMLElement;
  return within(dl).getByText(term, { selector: "dt" }).nextElementSibling?.textContent;
}

function params(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}

describe("users list", () => {
  it("lists users, filters by username and status, and pages", async () => {
    const requests: Record<string, string>[] = [];
    server.use(
      http.get(`${BASE}/users`, ({ request }) => {
        const q = params(request.url);
        requests.push(q);
        if (q.page === "1") return HttpResponse.json(page([BOB], 1, 1, 2));
        if (q.username === "bo") return HttpResponse.json(page([{ ...BOB, enabled: false }]));
        return HttpResponse.json(page([ALICE], 0, 1, 2));
      }),
    );
    renderAt("/admin/users");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "alice" }).getAttribute("href")).toBe("/admin/users/u-1");
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.getByText("2 users")).toBeTruthy();
    expect(screen.getByText("Admin area")).toBeTruthy();
    expect(within(table).getByText("Enabled")).toBeTruthy();
    expect(requests[0]).toEqual({ page: "0", size: "20" });
    expect(screen.getByRole("link", { name: "Admin" }).getAttribute("href")).toBe("/admin/users");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("link", { name: "bob" })).toBeTruthy();
    expect(requests.at(-1)).toEqual({ page: "1", size: "20" });

    fireEvent.input(screen.getByLabelText("Username"), { target: { value: "bo" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "false" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    // A new filter starts again at the first page
    await waitFor(() => expect(requests.at(-1)).toEqual({ username: "bo", enabled: "false", page: "0", size: "20" }));
    expect(await screen.findByRole("cell", { name: "Disabled" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Page size"), { target: { value: "50" } });
    await waitFor(() => expect(requests.at(-1)).toEqual({ username: "bo", enabled: "false", page: "0", size: "50" }));
  });

  it("goes back to the first page on INVALID_PAGE", async () => {
    const requests: Record<string, string>[] = [];
    server.use(
      http.get(`${BASE}/users`, ({ request }) => {
        const q = params(request.url);
        requests.push(q);
        if (Number(q.page) < 0 || Number(q.size) > 100) {
          return error(400, "INVALID_PAGE", ["page must be 0 or more and size between 1 and 100."]);
        }
        return HttpResponse.json(page([ALICE]));
      }),
    );
    renderAt("/admin/users?page=-1&size=500&username=al");
    expect(await screen.findByRole("link", { name: "alice" })).toBeTruthy();
    expect(screen.getByText("That page does not exist, so the first page is shown.")).toBeTruthy();
    // The filter stays; only page and size are reset
    expect(requests.at(-1)).toEqual({ username: "al", page: "0", size: "20" });
  });

  it("sorts from the headers, resetting the page, and resets on INVALID_SORT", async () => {
    const requests: Record<string, string>[] = [];
    server.use(
      http.get(`${BASE}/users`, ({ request }) => {
        const q = params(request.url);
        requests.push(q);
        if (q.sort === "bogus,asc") return error(400, "INVALID_SORT", ["sort is not valid."]);
        return HttpResponse.json(page([ALICE]));
      }),
    );
    renderAt("/admin/users?page=2");
    await screen.findByRole("link", { name: "alice" });
    const created = screen.getByRole("columnheader", { name: /Created/ });
    expect(created.getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(screen.getByRole("button", { name: "Username" }));
    await waitFor(() => expect(requests.at(-1)).toEqual({ sort: "username,asc", page: "0", size: "20" }));
    expect(screen.getByRole("columnheader", { name: /Username/ }).getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(screen.getByRole("button", { name: "Username" }));
    await waitFor(() => expect(requests.at(-1)).toEqual({ sort: "username,desc", page: "0", size: "20" }));
  });

  it("goes back to the default order on INVALID_SORT", async () => {
    const requests: Record<string, string>[] = [];
    server.use(
      http.get(`${BASE}/users`, ({ request }) => {
        const q = params(request.url);
        requests.push(q);
        if (q.sort === "bogus,asc") return error(400, "INVALID_SORT", ["sort is not valid."]);
        return HttpResponse.json(page([ALICE]));
      }),
    );
    renderAt("/admin/users?sort=bogus,asc&username=al");
    expect(await screen.findByRole("link", { name: "alice" })).toBeTruthy();
    expect(screen.getByText("That sort order does not exist, so the default order is shown.")).toBeTruthy();
    expect(requests.at(-1)).toEqual({ username: "al", page: "0", size: "20" });
  });

  it("says so when the server no longer sees an admin", async () => {
    // The token still says ADMIN, but the account was demoted since
    server.use(http.get(`${BASE}/users`, () => error(403, "ACCESS_DENIED", ["Access Denied"])));
    renderAt("/admin/users");
    expect(await screen.findByText(/You no longer have admin access/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("admin access on the client", () => {
  it("hides the link and the route from a non-admin", async () => {
    let userCalls = 0;
    server.use(
      refreshAs("USER"),
      http.get(`${BASE}/users`, () => {
        userCalls++;
        return HttpResponse.json(page([]));
      }),
      http.get(`${BASE}/api/expense`, () => HttpResponse.json({ count: 0, total_amount: 0, expenses: [] })),
      http.get(`${BASE}/api/expense/summary`, () =>
        HttpResponse.json({ from: null, to: null, count: 0, total_amount: 0, by_category: [] }),
      ),
    );
    renderAt("/admin/users");
    expect(await screen.findByRole("heading", { name: "Expenses" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    expect(userCalls).toBe(0);
  });
});

describe("edit user", () => {
  async function renderBob() {
    renderAt("/admin/users/u-2");
    await screen.findByRole("heading", { name: "bob" });
  }

  it("saves only what changed with the version and shows the new version", async () => {
    const bodies: unknown[] = [];
    server.use(
      getUser(BOB),
      patchUser("u-2", bodies, () =>
        HttpResponse.json({ ...BOB, role: "ADMIN", version: 4, lastModified: "2026-10-18T09:00:00" }),
      ),
    );
    await renderBob();
    expect(detail("Version")).toBe("3");
    // A promotion is not destructive, so it saves without a confirm
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "ADMIN" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(bodies).toEqual([{ version: 3, role: "ADMIN" }]);
    expect(detail("Version")).toBe("4");
    expect(detail("Role")).toBe("ADMIN");
  });

  it("confirms a disable inline before sending it", async () => {
    const bodies: unknown[] = [];
    server.use(getUser(BOB), patchUser("u-2", bodies, () => HttpResponse.json({ ...BOB, enabled: false, version: 4 })));
    await renderBob();
    fireEvent.click(screen.getByLabelText("Enabled"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Disable bob\?/)).toBeTruthy();
    expect(bodies).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm save" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(bodies).toEqual([{ version: 3, enabled: false }]);
  });

  it("shows CANNOT_MODIFY_SELF at the form", async () => {
    server.use(
      getUser(ALICE),
      patchUser("u-1", [], () => error(409, "CANNOT_MODIFY_SELF", ["You cannot disable or demote yourself."])),
    );
    renderAt("/admin/users/u-1");
    await screen.findByRole("heading", { name: "alice" });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "USER" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Demote alice\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You cannot disable or demote yourself.");
  });

  it("shows LAST_ADMIN at the form", async () => {
    const carol: AdminUserDto = { ...BOB, id: "u-3", username: "carol", role: "ADMIN" };
    server.use(
      getUser(carol),
      patchUser("u-3", [], () =>
        error(409, "LAST_ADMIN", ["The last enabled admin cannot be disabled or demoted."]),
      ),
    );
    renderAt("/admin/users/u-3");
    await screen.findByRole("heading", { name: "carol" });
    fireEvent.click(screen.getByLabelText("Enabled"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm save" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "carol is the last enabled admin, so they cannot be disabled or demoted.",
    );
  });

  it("offers Reload on CONCURRENT_MODIFICATION and keeps the input", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      getUser(BOB, { ...BOB, version: 5 }),
      patchUser("u-2", bodies, (body) =>
        body.version === 3
          ? error(409, "CONCURRENT_MODIFICATION", ["User was modified by another user"])
          : HttpResponse.json({ ...BOB, role: "ADMIN", version: 6 }),
      ),
    );
    await renderBob();
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "ADMIN" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/This user was changed elsewhere/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(detail("Version")).toBe("5"));
    expect((screen.getByLabelText("Role") as HTMLSelectElement).value).toBe("ADMIN");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(bodies.map((b) => b.version)).toEqual([3, 5]);
    expect(bodies[1]).toEqual({ version: 5, role: "ADMIN" });
  });

  it("shows EMPTY_PATCH when nothing changed", async () => {
    const bodies: unknown[] = [];
    server.use(
      getUser(BOB),
      patchUser("u-2", bodies, () => error(400, "EMPTY_PATCH", ["Nothing to change: give enabled and/or role."])),
    );
    await renderBob();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nothing to change. Change the status or the role first.",
    );
    expect(bodies).toEqual([{ version: 3 }]);
  });

  it("says so when a demoted admin saves", async () => {
    server.use(getUser(BOB), patchUser("u-2", [], () => error(403, "ACCESS_DENIED", ["Access Denied"])));
    await renderBob();
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "ADMIN" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/You no longer have admin access/);
  });

  it("shows Not found for an unknown user", async () => {
    server.use(http.get(`${BASE}/users/u-9`, () => error(404, "USER_NOT_FOUND", ["User not found."])));
    renderAt("/admin/users/u-9");
    expect(await screen.findByRole("heading", { name: "Not found" })).toBeTruthy();
  });
});
