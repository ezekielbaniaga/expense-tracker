import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
  return render(
    <AppProviders client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

const LEGACY_ITEM = { id: "l1", description: null, amount: null, category: null, date: null, version: 0 };
const LEGACY_EXPENSE = { ...LEGACY_ITEM, createdAt: null, lastModified: null };

describe("expense list", () => {
  it("shows amounts with the symbol once a display currency is set", async () => {
    localStorage.setItem("ui.currency", "USD");
    try {
      server.use(
        http.get(`${BASE}/api/expense`, () =>
          HttpResponse.json({
            expenses: [{ id: "e1", description: "Lunch", amount: 1284.5, category: "FOOD", date: "2026-10-17", version: 0 }],
            count: 1,
            total_amount: 1284.5,
          }),
        ),
      );
      renderAt("/");
      const row = await screen.findByRole("row", { name: /Lunch/ });
      expect(within(row).getByText("$1,284.50")).toBeTruthy();
      expect(screen.getAllByText("$1,284.50").length).toBe(2);
    } finally {
      localStorage.removeItem("ui.currency");
    }
  });

  it("shows rows, the server's count and total, and sends version 1.2 with the token", async () => {
    let version: string | null = null;
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/api/expense`, ({ request }) => {
        version = request.headers.get("X-API-Version");
        auth = request.headers.get("Authorization");
        return HttpResponse.json({
          expenses: [
            { id: "e1", description: "Lunch", amount: 12.5, category: "FOOD", date: "2026-10-17", version: 0 },
            { id: "e2", description: "Bus", amount: 3, category: "TRANSPORT", date: "2026-10-16", version: 1 },
          ],
          count: 2,
          // Deliberately not the sum of the rows: the browser must show the server's value
          total_amount: 99.1,
        });
      }),
    );
    renderAt("/");
    const lunch = await screen.findByRole("link", { name: "Lunch" });
    expect(lunch.getAttribute("href")).toBe("/expenses/e1");
    const row = screen.getByRole("row", { name: /Lunch/ });
    expect(within(row).getByText("Food")).toBeTruthy();
    expect(within(row).getByText("Oct 17, 2026")).toBeTruthy();
    expect(within(row).getByText("12.50")).toBeTruthy();
    expect(screen.getByText("Transport")).toBeTruthy();
    expect(screen.getByText("3.00")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("99.10")).toBeTruthy();
    expect(version).toBe("1.2");
    expect(auth).toMatch(/^Bearer /);
    expect(queryClient.getQueryData(["expenses"])).toBeTruthy();
  });

  it("renders a legacy row whose nullable fields are all null", async () => {
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({
          expenses: [LEGACY_ITEM, { id: "e2", description: "Lunch", amount: 4, category: "FOOD", date: "2026-10-17", version: 1 }],
          count: 2,
          total_amount: 4,
        }),
      ),
    );
    renderAt("/");
    expect(await screen.findByText("Lunch")).toBeTruthy();
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual(["(no description)", "—", "—", "—"]);
  });

  it("shows an empty state", async () => {
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({ expenses: [], count: 0, total_amount: 0 }),
      ),
    );
    renderAt("/");
    expect(await screen.findByText("Nothing here yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows an error toast and a retry that works", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/expense`, () => {
        calls++;
        return calls === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR", messages: ["Boom"] }, { status: 500 })
          : HttpResponse.json({ expenses: [], count: 0, total_amount: 0 });
      }),
    );
    renderAt("/");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Could not load expenses\. Boom/);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Nothing here yet.")).toBeTruthy();
  });

  it("keeps the account menu and links to the archived screen reachable", async () => {
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({ expenses: [], count: 0, total_amount: 0 }),
      ),
    );
    renderAt("/");
    expect(await screen.findByRole("button", { name: /^Account menu for / })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Archived" }).getAttribute("href")).toBe("/archived");
  });
});

describe("archived screen", () => {
  it("lists archived expenses newest archivedAt first, read-only", async () => {
    server.use(
      http.get(`${BASE}/api/expense/archived`, () =>
        HttpResponse.json({
          expenses: [
            { id: "a1", description: "Old", amount: 1, archivedAt: "2026-09-01T10:00:00" },
            { id: "a2", description: "Newest", amount: 2.5, archivedAt: "2026-10-01T08:30:15.123456" },
            { id: "a3", description: "Middle", amount: 3, archivedAt: "2026-09-15T10:00:00" },
          ],
          count: 3,
        }),
      ),
    );
    renderAt("/archived");
    await screen.findByText("Newest");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual([
      "Newest",
      "Middle",
      "Old",
    ]);
    expect(within(rows[0]).getByText("Oct 1, 2026, 8:30 AM")).toBeTruthy();
    expect(within(rows[0]).getByText("2.50")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Newest" })).toBeNull();
    expect(queryClient.getQueryData(["archived"])).toBeTruthy();
  });

  it("renders an archived row with null description and amount", async () => {
    server.use(
      http.get(`${BASE}/api/expense/archived`, () =>
        HttpResponse.json({
          expenses: [{ id: "a1", description: null, amount: null, archivedAt: "2026-09-01T10:00:00" }],
          count: 1,
        }),
      ),
    );
    renderAt("/archived");
    await screen.findByText("Sep 1, 2026, 10:00 AM");
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells.map((c) => c.textContent).slice(0, 2)).toEqual(["(no description)", "—"]);
  });

  it("shows an empty state", async () => {
    server.use(
      http.get(`${BASE}/api/expense/archived`, () => HttpResponse.json({ expenses: [], count: 0 })),
    );
    renderAt("/archived");
    expect(await screen.findByText("Nothing archived. Deleted expenses wait here for a while.")).toBeTruthy();
  });

  it("shows an error toast", async () => {
    server.use(
      http.get(`${BASE}/api/expense/archived`, () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", messages: ["Boom"] }, { status: 500 }),
      ),
    );
    renderAt("/archived");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not load archived expenses/);
  });
});

describe("expense detail", () => {
  it("shows every field of the expense", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/api/expense/e1`, ({ request }) => {
        auth = request.headers.get("Authorization");
        return HttpResponse.json({
          id: "e1",
          version: 3,
          description: "Lunch",
          amount: 12.5,
          category: "FOOD",
          date: "2026-10-17",
          createdAt: "2026-10-17T12:30:00",
          lastModified: "2026-10-18T08:05:09.123",
        });
      }),
    );
    renderAt("/expenses/e1");
    expect(await screen.findByRole("heading", { name: "Lunch" })).toBeTruthy();
    expect(screen.getByText("e1")).toBeTruthy();
    expect(screen.getByText("12.50")).toBeTruthy();
    expect(screen.getByText("Food")).toBeTruthy();
    expect(screen.getByText("Oct 17, 2026")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Oct 17, 2026, 12:30 PM")).toBeTruthy();
    expect(screen.getByText("Oct 18, 2026, 8:05 AM")).toBeTruthy();
    expect(auth).toMatch(/^Bearer /);
  });

  it("renders a legacy expense whose nullable fields are all null", async () => {
    server.use(http.get(`${BASE}/api/expense/l1`, () => HttpResponse.json(LEGACY_EXPENSE)));
    renderAt("/expenses/l1");
    expect(await screen.findByRole("heading", { name: "(no description)" })).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("shows Never for an expense that was never modified", async () => {
    server.use(
      http.get(`${BASE}/api/expense/e1`, () =>
        HttpResponse.json({
          id: "e1",
          version: 0,
          description: "Lunch",
          amount: 12.5,
          category: "FOOD",
          date: "2026-10-17",
          createdAt: "2026-10-17T12:30:00",
          lastModified: null,
        }),
      ),
    );
    renderAt("/expenses/e1");
    expect(await screen.findByRole("heading", { name: "Lunch" })).toBeTruthy();
    expect(screen.getByText("Never")).toBeTruthy();
  });

  it.each([
    [404, { code: "EXPENSE_NOT_FOUND", messages: ["Expense not found"] }],
    [400, { code: "INVALID_REQUEST", messages: ["id: Invalid value 'abc'"] }],
  ])("shows only 'Not found' for a %i", async (status, body) => {
    server.use(http.get(`${BASE}/api/expense/abc`, () => HttpResponse.json(body, { status })));
    renderAt("/expenses/abc");
    expect(await screen.findByText("Not found")).toBeTruthy();
    expect(screen.queryByText(/Expense not found|Invalid value/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to expenses" }).getAttribute("href")).toBe("/");
  });

  it("shows a retry for other errors", async () => {
    server.use(
      http.get(`${BASE}/api/expense/e1`, () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", messages: ["Boom"] }, { status: 500 }),
      ),
    );
    renderAt("/expenses/e1");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not load the expense/);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("create expense", () => {
  const categories = () =>
    http.get(`${BASE}/api/expense/categories`, () =>
      HttpResponse.json({ supported_categories: ["FOOD", "TRANSPORT"] }),
    );

  function fill(values: { description?: string; amount?: string; category?: string; date?: string }) {
    const set = (label: string, value?: string) => {
      if (value !== undefined) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    };
    set("Description", values.description);
    set("Amount", values.amount);
    set("Category", values.category);
    set("Date", values.date);
  }

  it("shows client messages and sends nothing", async () => {
    let posts = 0;
    server.use(
      categories(),
      http.post(`${BASE}/api/expense`, () => {
        posts++;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderAt("/expenses/new");
    await screen.findByLabelText("Category");
    fill({ description: "   ", amount: "0", date: "2999-01-01" });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText("Description is required")).toBeTruthy();
    expect(screen.getByText("Amount must be greater than 0")).toBeTruthy();
    expect(screen.getByText("Choose a category")).toBeTruthy();
    expect(screen.getByText("Date must be today or earlier")).toBeTruthy();

    fill({ description: "x".repeat(251), amount: "123456789", category: "FOOD", date: "2026-10-17" });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText("Description must be at most 250 characters")).toBeTruthy();
    expect(screen.getByText(/at most 8 digits and 2 decimals/)).toBeTruthy();

    fill({ amount: "1.234" });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText(/at most 8 digits and 2 decimals/)).toBeTruthy();
    expect(posts).toBe(0);
  });

  it("posts the expense, invalidates the list and opens the new expense", async () => {
    let body: unknown;
    server.use(
      categories(),
      http.post(`${BASE}/api/expense`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            id: "n1",
            version: 0,
            description: "Lunch",
            amount: 12.5,
            category: "FOOD",
            date: "2026-10-17",
            createdAt: "2026-10-18T09:00:00",
            lastModified: null,
          },
          { status: 201 },
        );
      }),
      http.get(`${BASE}/api/expense/n1`, () =>
        HttpResponse.json({
          id: "n1",
          version: 0,
          description: "Lunch",
          amount: 12.5,
          category: "FOOD",
          date: "2026-10-17",
          createdAt: "2026-10-18T09:00:00",
          lastModified: null,
        }),
      ),
    );
    queryClient.setQueryData(["expenses"], { expenses: [], count: 0, totalAmount: 0 });
    renderAt("/expenses/new");
    await screen.findByLabelText("Category");
    fill({ description: "Lunch", amount: "12.50", category: "FOOD", date: "2026-10-17" });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByRole("heading", { name: "Lunch" })).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toBe("Added Lunch · 12.50");
    expect(body).toEqual({ description: "Lunch", amount: 12.5, category: "FOOD", date: "2026-10-17" });
    expect(queryClient.getQueryState(["expenses"])?.isInvalidated).toBe(true);
  });

  it("attaches a server VALIDATION_ERROR to the fields", async () => {
    server.use(
      categories(),
      http.post(`${BASE}/api/expense`, () =>
        HttpResponse.json(
          { code: "VALIDATION_ERROR", messages: ["description: size must be between 0 and 250", "other: odd"] },
          { status: 400 },
        ),
      ),
    );
    renderAt("/expenses/new");
    await screen.findByLabelText("Category");
    fill({ description: "Lunch", amount: "5", category: "FOOD", date: "2026-10-17" });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByText("size must be between 0 and 250")).toBeTruthy();
    expect(screen.getByLabelText("Description").getAttribute("aria-invalid")).toBe("true");
    expect((await screen.findByRole("alert")).textContent).toBe("other: odd");
  });

  it("shows INVALID_CATEGORY at form level and keeps the input", async () => {
    server.use(
      categories(),
      http.post(`${BASE}/api/expense`, () =>
        HttpResponse.json(
          { code: "INVALID_CATEGORY", messages: ["Invalid category: FOOD"] },
          { status: 400 },
        ),
      ),
    );
    renderAt("/expenses/new");
    await screen.findByLabelText("Category");
    fill({ description: "Lunch", amount: "5", category: "FOOD", date: "2026-10-17" });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Invalid category: FOOD");
    expect((screen.getByLabelText("Description") as HTMLInputElement).value).toBe("Lunch");
    expect((screen.getByRole("button", { name: "Add expense" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("edit, patch description and delete", () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    id: "e1",
    version: 3,
    description: "Lunch",
    amount: 12.5,
    category: "FOOD",
    date: "2026-10-17",
    createdAt: "2026-10-17T12:30:00",
    lastModified: "2026-10-17T12:30:00",
    ...over,
  });
  const detail = (over: Record<string, unknown> = {}) =>
    http.get(`${BASE}/api/expense/e1`, () => HttpResponse.json(stored(over)));
  const categories = () =>
    http.get(`${BASE}/api/expense/categories`, () =>
      HttpResponse.json({ supported_categories: ["FOOD", "TRANSPORT"] }),
    );
  const conflict = (code: string) =>
    HttpResponse.json({ code, messages: ["nope"] }, { status: 409 });
  const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

  async function openEdit() {
    renderAt("/expenses/e1");
    await screen.findByRole("heading", { name: "Lunch" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText("Category");
  }

  it("PUTs the form with the version, then shows the response and invalidates the list", async () => {
    let body: unknown;
    server.use(
      detail(),
      categories(),
      http.put(`${BASE}/api/expense/e1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(stored({ version: 4, description: "Dinner", amount: 20 }));
      }),
    );
    queryClient.setQueryData(["expenses"], { expenses: [], count: 0, totalAmount: 0 });
    await openEdit();
    expect(input("Description").value).toBe("Lunch");
    fireEvent.change(input("Description"), { target: { value: "Dinner" } });
    fireEvent.change(input("Amount"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Dinner" })).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toBe("Saved");
    expect(body).toEqual({
      description: "Dinner",
      amount: 20,
      category: "FOOD",
      date: "2026-10-17",
      version: 3,
    });
    expect(screen.getByText("4")).toBeTruthy();
    expect(queryClient.getQueryData<{ version: number }>(["expense", "e1"])?.version).toBe(4);
    expect(queryClient.getQueryState(["expenses"])?.isInvalidated).toBe(true);
  });

  it("starts the edit form with empty fields for a legacy expense", async () => {
    server.use(detail(LEGACY_EXPENSE), categories());
    renderAt("/expenses/e1");
    await screen.findByRole("heading", { name: "(no description)" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText("Category");
    expect(input("Description").value).toBe("");
    expect(input("Amount").value).toBe("");
    expect(input("Date").value).toBe("");
    expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("");
  });

  it("shows client messages and sends nothing", async () => {
    let calls = 0;
    server.use(
      detail(),
      categories(),
      http.put(`${BASE}/api/expense/e1`, () => {
        calls++;
        return HttpResponse.json(stored());
      }),
    );
    await openEdit();
    fireEvent.change(input("Description"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Description is required")).toBeTruthy();
    expect(calls).toBe(0);
  });

  it("on 409 CONCURRENT_MODIFICATION keeps the input and Reload brings the new version", async () => {
    const versions: unknown[] = [];
    let current = 3;
    server.use(
      http.get(`${BASE}/api/expense/e1`, () => HttpResponse.json(stored({ version: current }))),
      categories(),
      http.put(`${BASE}/api/expense/e1`, async ({ request }) => {
        const { version } = (await request.json()) as { version: number };
        versions.push(version);
        return version === current
          ? HttpResponse.json(stored({ version: current + 1, description: "Dinner" }))
          : conflict("CONCURRENT_MODIFICATION");
      }),
    );
    await openEdit();
    current = 4; // changed in another tab
    fireEvent.change(input("Description"), { target: { value: "Dinner" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/changed elsewhere/);
    expect(input("Description").value).toBe("Dinner");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(await screen.findByText("4")).toBeTruthy();
    expect(input("Description").value).toBe("Dinner");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Dinner" })).toBeTruthy();
    expect(versions).toEqual([3, 4]);
  });

  it("on 409 MODIFY_ARCHIVED says it was deleted and goes to the list", async () => {
    server.use(
      detail(),
      categories(),
      http.put(`${BASE}/api/expense/e1`, () => conflict("MODIFY_ARCHIVED")),
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({ expenses: [], count: 0, total_amount: 0 }),
      ),
    );
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nothing here yet.")).toBeTruthy();
    expect(screen.getByText("This expense was deleted.")).toBeTruthy();
    expect(queryClient.getQueryData(["expense", "e1"])).toBeUndefined();
  });

  it("attaches a server VALIDATION_ERROR to the fields", async () => {
    server.use(
      detail(),
      categories(),
      http.put(`${BASE}/api/expense/e1`, () =>
        HttpResponse.json(
          { code: "VALIDATION_ERROR", messages: ["description: size must be between 0 and 250"] },
          { status: 400 },
        ),
      ),
    );
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("size must be between 0 and 250")).toBeTruthy();
    expect(input("Description").getAttribute("aria-invalid")).toBe("true");
  });

  it("PATCHes only the description with the version and updates the page", async () => {
    let body: unknown;
    server.use(
      detail(),
      http.patch(`${BASE}/api/expense/e1/description`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(stored({ version: 4, description: "Brunch" }));
      }),
    );
    renderAt("/expenses/e1");
    await screen.findByRole("heading", { name: "Lunch" });
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    fireEvent.change(input("Description"), { target: { value: "Brunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect(await screen.findByRole("heading", { name: "Brunch" })).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toBe("Description saved");
    expect(body).toEqual({ version: 3, description: "Brunch" });
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("keeps the typed description on a 409 and offers Reload", async () => {
    server.use(
      detail(),
      http.patch(`${BASE}/api/expense/e1/description`, () => conflict("CONCURRENT_MODIFICATION")),
    );
    renderAt("/expenses/e1");
    await screen.findByRole("heading", { name: "Lunch" });
    fireEvent.click(screen.getByRole("button", { name: "Edit description" }));
    fireEvent.change(input("Description"), { target: { value: "Brunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Reload/);
    expect(input("Description").value).toBe("Brunch");
  });

  it("DELETEs with ?version=, invalidates both lists and returns to the list", async () => {
    let query: string | null = null;
    server.use(
      detail(),
      http.delete(`${BASE}/api/expense/e1`, ({ request }) => {
        query = new URL(request.url).search;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({ expenses: [], count: 0, total_amount: 0 }),
      ),
    );
    queryClient.setQueryData(["expenses"], { expenses: [], count: 0, totalAmount: 0 });
    queryClient.setQueryData(["archived"], []);
    renderAt("/expenses/e1");
    await screen.findByRole("heading", { name: "Lunch" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Nothing here yet.")).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toBe("Expense deleted. It's in Archived for now.");
    expect(query).toBe("?version=3");
    expect(queryClient.getQueryState(["archived"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(["expense", "e1"])).toBeUndefined();
  });

  it("offers Reload when the delete hits a stale version", async () => {
    server.use(
      detail(),
      http.delete(`${BASE}/api/expense/e1`, () => conflict("CONCURRENT_MODIFICATION")),
    );
    renderAt("/expenses/e1");
    await screen.findByRole("heading", { name: "Lunch" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/changed elsewhere/);
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});
