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

describe("expense list", () => {
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
    expect(within(row).getByText("2026-10-17")).toBeTruthy();
    expect(within(row).getByText("12.50")).toBeTruthy();
    expect(screen.getByText("Transport")).toBeTruthy();
    expect(screen.getByText("3.00")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("99.10")).toBeTruthy();
    expect(version).toBe("1.2");
    expect(auth).toMatch(/^Bearer /);
    expect(queryClient.getQueryData(["expenses"])).toBeTruthy();
  });

  it("shows an empty state", async () => {
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({ expenses: [], count: 0, total_amount: 0 }),
      ),
    );
    renderAt("/");
    expect(await screen.findByText("No expenses yet.")).toBeTruthy();
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
    expect(await screen.findByText("No expenses yet.")).toBeTruthy();
  });

  it("keeps Sign out and links to the archived screen reachable", async () => {
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({ expenses: [], count: 0, total_amount: 0 }),
      ),
    );
    renderAt("/");
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeTruthy();
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
    expect(within(rows[0]).getByText("2026-10-01 08:30")).toBeTruthy();
    expect(within(rows[0]).getByText("2.50")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Newest" })).toBeNull();
    expect(queryClient.getQueryData(["archived"])).toBeTruthy();
  });

  it("shows an empty state", async () => {
    server.use(
      http.get(`${BASE}/api/expense/archived`, () => HttpResponse.json({ expenses: [], count: 0 })),
    );
    renderAt("/archived");
    expect(await screen.findByText("No archived expenses.")).toBeTruthy();
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
    expect(screen.getByText("2026-10-17")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("2026-10-17 12:30")).toBeTruthy();
    expect(screen.getByText("2026-10-18 08:05")).toBeTruthy();
    expect(auth).toMatch(/^Bearer /);
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
            lastModified: "2026-10-18T09:00:00",
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
          lastModified: "2026-10-18T09:00:00",
        }),
      ),
    );
    queryClient.setQueryData(["expenses"], { expenses: [], count: 0, totalAmount: 0 });
    renderAt("/expenses/new");
    await screen.findByLabelText("Category");
    fill({ description: "Lunch", amount: "12.50", category: "FOOD", date: "2026-10-17" });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByRole("heading", { name: "Lunch" })).toBeTruthy();
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
