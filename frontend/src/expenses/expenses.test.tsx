import { vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { AppProviders, AppRoutes } from "../App";
import { createApiClient, type ApiClient } from "../api/client";
import { fakeJwt } from "../test/fakeJwt";
import { periodRange } from "./listParams";
import { categoryLabel, todayIso, yesterdayIso } from "../api/expense";

const BASE = "http://localhost";
const server = setupServer(
  http.get(`${BASE}/api/expense/summary`, () =>
    HttpResponse.json({ from: null, to: null, count: 0, total_amount: 0, by_category: [] }),
  ),
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

const EMPTY_PAGE = { expenses: [], page: 0, size: 20, total: 0, total_pages: 0, total_amount: 0 };
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
            page: 0,
            size: 20,
            total: 1,
            total_pages: 1,
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

  it("shows rows, the server's count and total, and sends version 1.3 with the token", async () => {
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
          page: 0,
          size: 20,
          total: 2,
          total_pages: 1,
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
    expect(within(screen.getByRole("table")).getByText("Transport")).toBeTruthy();
    expect(screen.getByText("3.00")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("99.10")).toBeTruthy();
    expect(version).toBe("1.3");
    expect(auth).toMatch(/^Bearer /);
    expect(
      queryClient.getQueryData([
        "expenses",
        {
          q: "", category: [], from: periodRange("month").from, to: todayIso(), minAmount: "", maxAmount: "",
          sort: "date,desc", page: 0, size: 20,
        },
      ]),
    ).toBeTruthy();
  });

  it("shows the summary card: server numbers, a labelled bar and a legend", async () => {
    let requested: URL | null = null;
    let version: string | null = null;
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({
          ...EMPTY_PAGE,
          expenses: [{ id: "e1", description: "Lunch", amount: 12.5, category: "FOOD", date: todayIso(), version: 0 }],
          total: 23,
          total_pages: 1,
          total_amount: 1284.5,
        }),
      ),
      http.get(`${BASE}/api/expense/summary`, ({ request }) => {
        requested = new URL(request.url);
        version = request.headers.get("X-API-Version");
        return HttpResponse.json({
          from: periodRange("month").from,
          to: todayIso(),
          count: 23,
          total_amount: 1000,
          by_category: [
            { category: "FOOD", count: 10, total_amount: 750 },
            { category: "BILLS", count: 13, total_amount: 250 },
          ],
        });
      }),
    );
    renderAt("/");
    const bar = await screen.findByRole("img", { name: /Spending by category/ });
    expect(bar.getAttribute("aria-label")).toBe("Spending by category: Food 750.00 (75%), Bills 250.00 (25%)");
    expect(screen.getByText("1,284.50")).toBeTruthy();
    expect(screen.getByText("23")).toBeTruthy();
    expect(screen.getByText(/Food 750\.00/).textContent).toContain("75%");
    expect(screen.getByText(/Bills 250\.00/).textContent).toContain("25%");
    expect(requested!.searchParams.get("from")).toBe(periodRange("month").from);
    expect(requested!.searchParams.get("to")).toBe(todayIso());
    expect(version).toBe("1.0");
    expect(queryClient.getQueryData(["expenses", "summary", { from: periodRange("month").from, to: todayIso(), q: "", category: [], minAmount: "", maxAmount: "" }])).toBeTruthy();
  });

  it("sends the list filters to the summary so its breakdown agrees with the filtered total", async () => {
    const requests: URL[] = [];
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({
          ...EMPTY_PAGE,
          expenses: [{ id: "e1", description: "Snack", amount: 5, category: "FOOD", date: todayIso(), version: 0 }],
          total: 1,
          total_pages: 1,
          total_amount: 5,
        }),
      ),
      http.get(`${BASE}/api/expense/summary`, ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const foodOnly = url.searchParams.getAll("category").includes("FOOD");
        return HttpResponse.json({
          from: null,
          to: null,
          count: foodOnly ? 1 : 2,
          total_amount: foodOnly ? 5 : 105,
          by_category: foodOnly
            ? [{ category: "FOOD", count: 1, total_amount: 5 }]
            : [
                { category: "BILLS", count: 1, total_amount: 100 },
                { category: "FOOD", count: 1, total_amount: 5 },
              ],
        });
      }),
    );
    renderAt("/?period=all&category=FOOD&q=snack&minAmount=1&maxAmount=50");
    await screen.findByRole("img", { name: /Spending by category/ });
    const last = requests[requests.length - 1];
    expect(last.searchParams.getAll("category")).toEqual(["FOOD"]);
    expect(last.searchParams.get("q")).toBe("snack");
    expect(last.searchParams.get("minAmount")).toBe("1");
    expect(last.searchParams.get("maxAmount")).toBe("50");
    expect(last.searchParams.has("page")).toBe(false);
    expect(last.searchParams.has("sort")).toBe(false);
    expect(screen.getByRole("img", { name: /Spending by category/ }).getAttribute("aria-label")).not.toMatch(/Bills/);
    expect(
      queryClient.getQueryData(["expenses", "summary", { from: "", to: "", q: "snack", category: ["FOOD"], minAmount: "1", maxAmount: "50" }]),
    ).toBeTruthy();
  });

  it("refetches the summary when an expense list is invalidated", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({ ...EMPTY_PAGE, expenses: [LEGACY_ITEM], total: 1, total_pages: 1, total_amount: 5 }),
      ),
      http.get(`${BASE}/api/expense/summary`, () => {
        calls++;
        return HttpResponse.json({ from: null, to: null, count: 1, total_amount: 5, by_category: [] });
      }),
    );
    renderAt("/");
    await screen.findByText("5.00");
    await waitFor(() => expect(calls).toBe(1));
    await queryClient.invalidateQueries({ queryKey: ["expenses"] });
    await waitFor(() => expect(calls).toBe(2));
  });

  it("groups rows by day only for the date sort; links stay found by description", async () => {
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({
          ...EMPTY_PAGE,
          expenses: [
            { id: "e1", description: "Lunch", amount: 12.5, category: "FOOD", date: todayIso(), version: 0 },
            { id: "e2", description: "Taxi", amount: 8, category: "TRANSPORT", date: todayIso(), version: 0 },
            { id: "e3", description: "Bus", amount: 3, category: "TRANSPORT", date: yesterdayIso(), version: 0 },
          ],
          total: 3,
          total_pages: 1,
        }),
      ),
    );
    renderAt("/");
    expect((await screen.findByRole("link", { name: "Lunch" })).getAttribute("href")).toBe("/expenses/e1");
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Today", "Yesterday"]);
    expect(screen.getAllByRole("rowgroup").length).toBeGreaterThan(2);
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    await waitFor(() => expect(screen.queryAllByRole("rowheader")).toHaveLength(0));
    expect(screen.getByRole("link", { name: "Taxi" })).toBeTruthy();
  });

  it("renders a legacy row whose nullable fields are all null", async () => {
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({
          expenses: [LEGACY_ITEM, { id: "e2", description: "Lunch", amount: 4, category: "FOOD", date: "2026-10-17", version: 1 }],
          page: 0,
          size: 20,
          total: 2,
          total_pages: 1,
          total_amount: 4,
        }),
      ),
    );
    renderAt("/");
    expect(await screen.findByText("Lunch")).toBeTruthy();
    const cells = within(screen.getByRole("row", { name: /no description/ })).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual(["(no description)", "—", "—", "—"]);
  });

  it("shows an empty state", async () => {
    server.use(
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json(EMPTY_PAGE),
      ),
    );
    renderAt("/");
    expect(await screen.findByText("Nothing here yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("sends the URL params as the 1.3 query string", async () => {
    let search = "";
    server.use(
      http.get(`${BASE}/api/expense`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json(EMPTY_PAGE);
      }),
    );
    renderAt("/?q=lunch&category=FOOD&category=BILLS&from=2026-10-01&sort=amount,asc&page=1&size=10");
    expect(await screen.findByText("No expenses match these filters.")).toBeTruthy();
    expect(search).toBe(
      "?page=1&size=10&sort=amount%2Casc&q=lunch&category=FOOD&category=BILLS&from=2026-10-01",
    );
  });

  it("sorts by header click (URL, aria-sort, request, live region) and flips on the second click", async () => {
    const sorts: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/api/expense`, ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get("sort"));
        return HttpResponse.json({
          ...EMPTY_PAGE,
          expenses: [{ id: "e1", description: "Lunch", amount: 5, category: "FOOD", date: "2026-10-01", version: 0 }],
          total: 1,
          total_pages: 1,
        });
      }),
    );
    renderAt("/");
    await screen.findByText("Lunch");
    expect(sorts.at(-1)).toBe("date,desc");
    const th = (name: string) => screen.getByRole("button", { name }).closest("th")!;
    expect(th("Date").getAttribute("aria-sort")).toBe("descending");
    expect(th("Amount").getAttribute("aria-sort")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    await waitFor(() => expect(sorts.at(-1)).toBe("amount,desc"));
    await waitFor(() => expect(th("Amount").getAttribute("aria-sort")).toBe("descending"));
    expect(th("Date").getAttribute("aria-sort")).toBeNull();
    expect(screen.getByText("Sorted by amount, highest first")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    await waitFor(() => expect(sorts.at(-1)).toBe("amount,asc"));
    await waitFor(() => expect(th("Amount").getAttribute("aria-sort")).toBe("ascending"));
    expect(screen.getByText("Sorted by amount, lowest first")).toBeTruthy();
  });

  describe("search, period and filters", () => {
    const ONE = { ...EMPTY_PAGE, expenses: [{ id: "e1", description: "Lunch", amount: 5, category: "FOOD", date: "2026-10-01", version: 0 }], total: 1, total_pages: 1 };
    function record(page: typeof ONE = ONE) {
      const queries: URLSearchParams[] = [];
      server.use(
        http.get(`${BASE}/api/expense`, ({ request }) => {
          queries.push(new URL(request.url).searchParams);
          return HttpResponse.json(page);
        }),
      );
      return queries;
    }

    it("defaults to This month in the local calendar", async () => {
      const queries = record();
      renderAt("/");
      await screen.findByText("Lunch");
      const today = new Date();
      expect(queries.at(-1)!.get("from")).toBe(todayIso(new Date(today.getFullYear(), today.getMonth(), 1)));
      expect(queries.at(-1)!.get("to")).toBe(todayIso());
      expect((screen.getByRole("radio", { name: "This month" }) as HTMLInputElement).checked).toBe(true);
      expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    });

    it("period chips write from/to; All time sends none; Custom opens Filters", async () => {
      const queries = record();
      renderAt("/");
      await screen.findByText("Lunch");
      const now = new Date();
      fireEvent.click(screen.getByRole("radio", { name: "Last month" }));
      await waitFor(() =>
        expect(queries.at(-1)!.get("from")).toBe(todayIso(new Date(now.getFullYear(), now.getMonth() - 1, 1))),
      );
      expect(queries.at(-1)!.get("to")).toBe(todayIso(new Date(now.getFullYear(), now.getMonth(), 0)));
      fireEvent.click(screen.getByRole("radio", { name: "All time" }));
      await waitFor(() => expect(queries.at(-1)!.has("from")).toBe(false));
      expect(queries.at(-1)!.has("to")).toBe(false);
      expect((screen.getByRole("radio", { name: "All time" }) as HTMLInputElement).checked).toBe(true);
      expect(screen.getByRole("button", { name: "Filters" }).getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
      expect(screen.getByRole("button", { name: "Filters" }).getAttribute("aria-expanded")).toBe("true");
    });

    it("debounces the search by 300 ms", async () => {
      const queries = record();
      renderAt("/?period=all");
      await screen.findByText("Lunch");
      const count = queries.length;
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        const box = screen.getByPlaceholderText("Search descriptions");
        fireEvent.change(box, { target: { value: "lun" } });
        vi.advanceTimersByTime(200);
        fireEvent.change(box, { target: { value: "lunch" } });
        vi.advanceTimersByTime(299);
        expect(queries.length).toBe(count);
        vi.advanceTimersByTime(1);
      } finally {
        vi.useRealTimers();
      }
      await waitFor(() => expect(queries.at(-1)!.get("q")).toBe("lunch"));
      expect(queries.filter((q) => q.get("q") === "lun")).toHaveLength(0);
    });

    it("keeps a trailing space in the search box after the debounce", async () => {
      const queries = record();
      renderAt("/?period=all");
      await screen.findByText("Lunch");
      const box = screen.getByPlaceholderText("Search descriptions") as HTMLInputElement;
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        fireEvent.change(box, { target: { value: "coffee " } });
        vi.advanceTimersByTime(300);
      } finally {
        vi.useRealTimers();
      }
      await waitFor(() => expect(queries.at(-1)!.get("q")).toBe("coffee"));
      expect(box.value).toBe("coffee ");
    });

    it("loads a 101-character URL q, cutting it to 100 in the box and the request", async () => {
      const queries = record();
      renderAt(`/?period=all&q=${"a".repeat(101)}`);
      await screen.findByText("Lunch");
      const box = screen.getByPlaceholderText("Search descriptions") as HTMLInputElement;
      expect(box.maxLength).toBe(100);
      expect(box.value).toBe("a".repeat(100));
      expect(queries.at(-1)!.get("q")).toBe("a".repeat(100));
      expect(screen.queryByText("Expenses could not be loaded")).toBeNull();
    });

    it("Clear filters empties a search that has reached the URL", async () => {
      const queries = record();
      renderAt("/?period=all");
      await screen.findByText("Lunch");
      const box = screen.getByPlaceholderText("Search descriptions") as HTMLInputElement;
      fireEvent.change(box, { target: { value: "coffee " } });
      await waitFor(() => expect(queries.at(-1)!.get("q")).toBe("coffee"));
      fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
      await waitFor(() => expect(box.value).toBe(""));
    });

    it("shows a q that changed outside the box (Back)", async () => {
      const queries = record();
      let navigate: ReturnType<typeof useNavigate> | undefined;
      function Grab() {
        navigate = useNavigate();
        return null;
      }
      render(
        <AppProviders client={client} queryClient={queryClient}>
          <MemoryRouter initialEntries={["/?period=all&q=tea"]}>
            <Grab />
            <AppRoutes />
          </MemoryRouter>
        </AppProviders>,
      );
      await screen.findByText("Lunch");
      const box = screen.getByPlaceholderText("Search descriptions") as HTMLInputElement;
      expect(box.value).toBe("tea");
      act(() => navigate!("/?period=all&q=milk"));
      await waitFor(() => expect(box.value).toBe("milk"));
      await waitFor(() => expect(queries.at(-1)!.get("q")).toBe("milk"));
      act(() => navigate!(-1));
      await waitFor(() => expect(box.value).toBe("tea"));
    });

    it("debounces the amount filters: one request, and the history entry is replaced", async () => {
      const queries = record();
      let navigate: ReturnType<typeof useNavigate> | undefined;
      function Grab() {
        navigate = useNavigate();
        return null;
      }
      render(
        <AppProviders client={client} queryClient={queryClient}>
          <MemoryRouter initialEntries={["/?period=all&q=tea"]}>
            <Grab />
            <AppRoutes />
          </MemoryRouter>
        </AppProviders>,
      );
      await screen.findByText("Lunch");
      act(() => navigate!("/?period=all"));
      await waitFor(() => expect((screen.getByPlaceholderText("Search descriptions") as HTMLInputElement).value).toBe(""));
      await waitFor(() => expect(queries.at(-1)!.has("q")).toBe(false));
      const count = queries.length;
      const min = screen.getByLabelText("Min amount") as HTMLInputElement;
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        for (const value of ["1", "12", "12.5"]) {
          fireEvent.change(min, { target: { value } });
          vi.advanceTimersByTime(100);
        }
        expect(min.value).toBe("12.5");
        vi.advanceTimersByTime(199);
        expect(queries.length).toBe(count);
        vi.advanceTimersByTime(1);
      } finally {
        vi.useRealTimers();
      }
      await waitFor(() => expect(queries.at(-1)!.get("minAmount")).toBe("12.5"));
      expect(queries.slice(count)).toHaveLength(1);
      // The typed value replaced the "/?period=all" entry, so Back goes to the one before it
      act(() => navigate!(-1));
      await waitFor(() => expect((screen.getByPlaceholderText("Search descriptions") as HTMLInputElement).value).toBe("tea"));
      await waitFor(() => expect(min.value).toBe(""));
    });

    it("category chips, date range and amounts reach the request and count on the Filters button", async () => {
      const queries = record();
      renderAt("/?period=all");
      await screen.findByText("Lunch");
      // One change at a time: each one lands in the URL (and so the request) before the next
      fireEvent.click(screen.getByRole("checkbox", { name: "Food" }));
      await waitFor(() => expect(queries.at(-1)!.getAll("category")).toEqual(["FOOD"]));
      fireEvent.click(screen.getByRole("checkbox", { name: "Bills" }));
      await waitFor(() => expect(queries.at(-1)!.getAll("category")).toEqual(["FOOD", "BILLS"]));
      fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-02" } });
      await waitFor(() => expect(queries.at(-1)!.get("from")).toBe("2026-10-02"));
      fireEvent.change(screen.getByLabelText("Min amount"), { target: { value: "1.5" } });
      await waitFor(() => expect(queries.at(-1)!.get("minAmount")).toBe("1.5"));
      fireEvent.change(screen.getByLabelText("Max amount"), { target: { value: "20" } });
      await waitFor(() => expect(queries.at(-1)!.get("maxAmount")).toBe("20"));
      const last = queries.at(-1)!;
      expect(last.getAll("category")).toEqual(["FOOD", "BILLS"]);
      expect(last.get("from")).toBe("2026-10-02");
      expect(last.get("minAmount")).toBe("1.5");
      expect(screen.getByRole("button", { name: "Filters \u00b7 3" })).toBeTruthy();
    });

    it("shows active filters as removable chips while the panel is collapsed", async () => {
      const queries = record();
      renderAt("/?period=all&category=FOOD&minAmount=10");
      await screen.findByText("Lunch");
      const panel = document.getElementById("expense-filters")!;
      expect(panel.getAttribute("data-open")).toBe("false");
      const tags = screen.getByRole("list", { name: "Active filters" });
      expect(within(tags).getByRole("button", { name: "Remove filter Food" })).toBeTruthy();
      fireEvent.click(within(tags).getByRole("button", { name: "Remove filter \u2265 10" }));
      await waitFor(() => expect(queries.at(-1)!.has("minAmount")).toBe(false));
      expect(panel.getAttribute("data-open")).toBe("false");
      fireEvent.click(screen.getByRole("button", { name: "Filters \u00b7 1" }));
      expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull();
    });

    it("groups the date and amount inputs into Dates and Amount fieldsets", async () => {
      record();
      renderAt("/?period=all");
      await screen.findByText("Lunch");
      const dates = screen.getByRole("group", { name: "Dates" });
      expect(within(dates).getByLabelText("From")).toBeTruthy();
      expect(within(dates).getByLabelText("To")).toBeTruthy();
      const amount = screen.getByRole("group", { name: "Amount" });
      expect(within(amount).getByLabelText("Min amount")).toBeTruthy();
      expect(within(amount).getByLabelText("Max amount")).toBeTruthy();
    });

    it("says nothing matches and Clear filters goes back to the defaults", async () => {
      const queries = record(EMPTY_PAGE);
      renderAt("/?q=zzz&category=FOOD&period=all");
      expect(await screen.findByText("No expenses match these filters.")).toBeTruthy();
      const buttons = screen.getAllByRole("button", { name: "Clear filters" });
      expect(buttons).toHaveLength(2); // the panel's link and the empty state's action
      fireEvent.click(buttons[1]);
      await waitFor(() => expect(queries.at(-1)!.has("q")).toBe(false));
      expect(queries.at(-1)!.has("category")).toBe(false);
      expect(queries.at(-1)!.has("from")).toBe(true);
      expect((screen.getByPlaceholderText("Search descriptions") as HTMLInputElement).value).toBe("");
    });
  });

  it("the Sort by select writes the same sort param", async () => {
    const sorts: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/api/expense`, ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get("sort"));
        return HttpResponse.json({
          ...EMPTY_PAGE,
          expenses: [{ id: "e1", description: "Lunch", amount: 5, category: "FOOD", date: "2026-10-01", version: 0 }],
          total: 1,
          total_pages: 1,
        });
      }),
    );
    renderAt("/");
    await screen.findByText("Lunch");
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "description,desc" } });
    await waitFor(() => expect(sorts.at(-1)).toBe("description,desc"));
    expect(screen.getByRole("button", { name: "Description" }).closest("th")!.getAttribute("aria-sort")).toBe(
      "descending",
    );
    expect((screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement).value).toBe("description,desc");
  });

  it("pages through the results and a size change goes back to page 0", async () => {
    const pages: string[] = [];
    server.use(
      http.get(`${BASE}/api/expense`, ({ request }) => {
        const url = new URL(request.url);
        pages.push(`${url.searchParams.get("page")}/${url.searchParams.get("size")}`);
        return HttpResponse.json({
          ...EMPTY_PAGE,
          expenses: [{ id: "e1", description: "Lunch", amount: 1, category: "FOOD", date: "2026-10-17", version: 0 }],
          page: Number(url.searchParams.get("page")),
          size: Number(url.searchParams.get("size")),
          total: 45,
          total_pages: 3,
          total_amount: 45,
        });
      }),
    );
    renderAt("/");
    expect(await screen.findByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 3")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Per page"), { target: { value: "10" } });
    await waitFor(() => expect(pages).toContain("0/10"));
    expect(pages.slice(0, 2)).toEqual(["0/20", "1/20"]);
  });

  describe("a page past the end", () => {
    /** `total` rows in pages of `size`; a page past the last comes back empty, like the server. */
    function serve(state: { total: number }) {
      const pages: string[] = [];
      server.use(
        http.get(`${BASE}/api/expense`, ({ request }) => {
          const url = new URL(request.url);
          const page = Number(url.searchParams.get("page"));
          const size = Number(url.searchParams.get("size"));
          pages.push(url.searchParams.get("page")!);
          const rows = Math.max(0, Math.min(size, state.total - page * size));
          return HttpResponse.json({
            ...EMPTY_PAGE,
            expenses: Array.from({ length: rows }, (_, i) => ({
              id: `e${page}-${i}`, description: `Item ${page}-${i}`, amount: 1, category: "FOOD", date: "2026-10-17", version: 0,
            })),
            page,
            size,
            total: state.total,
            total_pages: Math.ceil(state.total / size),
            total_amount: state.total,
          });
        }),
      );
      return pages;
    }

    it("replaces ?page=9 with the last page", async () => {
      const pages = serve({ total: 5 });
      renderAt("/?page=9");
      expect(await screen.findByText("Item 0-0")).toBeTruthy();
      expect(screen.queryByText(/Page \d+ of/)).toBeNull();
      expect(pages.at(-1)).toBe("0");
    });

    it("lands on the previous page when the last page's only item goes away", async () => {
      const state = { total: 21 };
      const pages = serve(state);
      renderAt("/");
      await screen.findByText("Item 0-0");
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(await screen.findByText("Item 1-0")).toBeTruthy();
      expect(screen.getByText("Page 2 of 2")).toBeTruthy();
      state.total = 20;
      await act(() => queryClient.invalidateQueries({ queryKey: ["expenses"] }));
      // The pager goes as soon as page 1 answers with one page left, before the redirect shows page 0
      await waitFor(() => {
        expect(screen.queryByText(/Page \d+ of/)).toBeNull();
        expect(screen.getByText("Item 0-0")).toBeTruthy();
        expect(pages.at(-1)).toBe("0");
      });
    });

    it("leaves an in-range page alone", async () => {
      const pages = serve({ total: 45 });
      renderAt("/?page=2");
      expect(await screen.findByText("Item 2-0")).toBeTruthy();
      expect(screen.getByText("Page 3 of 3")).toBeTruthy();
      expect(pages).toEqual(["2"]);
    });

    it("does not redirect when there are no expenses", async () => {
      const pages = serve({ total: 0 });
      renderAt("/?page=3");
      expect(await screen.findByText("Nothing here yet.")).toBeTruthy();
      expect(pages).toEqual(["3"]);
    });
  });

  it("resets the param a 400 INVALID_SORT names and shows a notice", async () => {
    const sorts: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/api/expense`, ({ request }) => {
        sorts.push(new URL(request.url).searchParams.get("sort"));
        return sorts.length === 1
          ? HttpResponse.json({ code: "INVALID_SORT", messages: ["Bad sort."] }, { status: 400 })
          : HttpResponse.json(EMPTY_PAGE);
      }),
    );
    renderAt("/?sort=description,asc&page=2");
    expect(await screen.findByText("Nothing here yet.")).toBeTruthy();
    expect(sorts).toEqual(["description,asc", "date,desc"]);
    expect(screen.getByRole("status").textContent).toMatch(/Bad sort\./);
  });

  it("shows an error toast and a retry that works", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/expense`, () => {
        calls++;
        return calls === 1
          ? HttpResponse.json({ code: "INTERNAL_ERROR", messages: ["Boom"] }, { status: 500 })
          : HttpResponse.json(EMPTY_PAGE);
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
        HttpResponse.json(EMPTY_PAGE),
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

  it("right-aligns archived amounts with tabular numbers and keeps amount and date on one line", async () => {
    server.use(
      http.get(`${BASE}/api/expense/archived`, () =>
        HttpResponse.json({
          expenses: [{ id: "a1", description: "Newest", amount: 2.5, archivedAt: "2026-10-01T08:30:00" }],
          count: 1,
        }),
      ),
    );
    renderAt("/archived");
    await screen.findByText("Newest");
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[1].className).toBe("table-narrow table-amount");
    expect(cells[2].className).toBe("table-narrow");
    expect(screen.getByRole("columnheader", { name: /Amount/ }).className).toBe("table-narrow table-amount");
  });

  it("sorts in the browser by column, flipping on the second click, nulls last", async () => {
    server.use(
      http.get(`${BASE}/api/expense/archived`, () =>
        HttpResponse.json({
          expenses: [
            { id: "a1", description: "Bravo", amount: 5, archivedAt: "2026-09-01T10:00:00" },
            { id: "a2", description: null, amount: null, archivedAt: "2026-10-01T10:00:00" },
            { id: "a3", description: "Alpha", amount: 9, archivedAt: "2026-09-15T10:00:00" },
          ],
          count: 3,
        }),
      ),
    );
    renderAt("/archived");
    await screen.findByText("Bravo");
    const names = () =>
      screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
    expect(names()).toEqual(["(no description)", "Alpha", "Bravo"]);
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    expect(names()).toEqual(["Alpha", "Bravo", "(no description)"]);
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    expect(names()).toEqual(["Bravo", "Alpha", "(no description)"]);
    fireEvent.click(screen.getByRole("button", { name: "Description" }));
    expect(names()).toEqual(["Alpha", "Bravo", "(no description)"]);
    fireEvent.click(screen.getByRole("button", { name: "Archived at" }));
    expect(names()).toEqual(["(no description)", "Alpha", "Bravo"]);
    expect(screen.getByText("Deleted expenses stay here for 30 days, then are removed.")).toBeTruthy();
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
    expect(screen.queryByRole("button", { name: "Edit description" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" }).className).toContain("btn--primary");
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("btn--danger-ghost");
    const tech = screen.getByText("Technical details").closest("details")!;
    expect(tech.open).toBe(false);
    expect(within(tech).getByText("e1")).toBeTruthy();
    expect(within(tech).getByText("3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy id" }).className).toContain("btn--sm");
    expect(screen.getByText("Saturday, October 17, 2026")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Details" })).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Oct 17, 2026, 12:30 PM")).toBeTruthy();
    expect(screen.getByText("Oct 18, 2026, 8:05 AM")).toBeTruthy();
    expect(auth).toMatch(/^Bearer /);
  });

  it("shortens a long id, keeps the full id as text and copies it", async () => {
    const id = "3f2a9c1e-7b4d-4e8a-9a10-5d6c7e8f0c91";
    server.use(
      http.get(`${BASE}/api/expense/${id}`, () =>
        HttpResponse.json({ ...LEGACY_EXPENSE, id, version: 0, description: "Lunch", lastModified: null }),
      ),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    try {
      renderAt(`/expenses/${id}`);
      expect(await screen.findByRole("heading", { name: "Lunch" })).toBeTruthy();
      expect(screen.getByText("Never")).toBeTruthy();
      expect(screen.getByText("3f2a…0c91")).toBeTruthy();
      expect(screen.getByText(id).className).toContain("visually-hidden");
      fireEvent.click(screen.getByRole("button", { name: "Copy id" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(id));
      expect((await screen.findByRole("status")).textContent).toBe("Id copied");
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
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
    if (values.category !== undefined) {
      fireEvent.click(screen.getByRole("radio", { name: categoryLabel(values.category) }));
    }
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
    await screen.findByRole("group", { name: "Category" });
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

  it("posts the expense, invalidates the list and returns to it", async () => {
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
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json({
          expenses: [{ id: "n1", description: "Lunch", amount: 12.5, category: "FOOD", date: "2026-10-17", version: 0 }],
          page: 0,
          size: 20,
          total: 1,
          total_pages: 1,
          total_amount: 12.5,
        }),
      ),
    );
    queryClient.setQueryData(["expenses"], { expenses: [], count: 0, totalAmount: 0 });
    renderAt("/expenses/new");
    await screen.findByRole("group", { name: "Category" });
    fill({ description: "Lunch", amount: "12.50", category: "FOOD", date: "2026-10-17" });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await screen.findByRole("heading", { name: "Expenses" })).toBeTruthy();
    expect(await screen.findByText("Added Lunch · 12.50")).toBeTruthy();
    expect(body).toEqual({ description: "Lunch", amount: 12.5, category: "FOOD", date: "2026-10-17" });
    // The seeded list was empty, so the row proves the list was invalidated and refetched
    expect((await screen.findByRole("row", { name: /Lunch/ })).className).toBe("row--new");
  });

  it("sets the date from the Today and Yesterday chips", async () => {
    server.use(categories());
    renderAt("/expenses/new");
    await screen.findByRole("group", { name: "Category" });
    const date = screen.getByLabelText("Date") as HTMLInputElement;
    expect(date.max).toBe(todayIso());
    expect((screen.getByRole("radio", { name: "Today" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Yesterday" }));
    expect(date.value).toBe(yesterdayIso());
    fireEvent.click(screen.getByRole("radio", { name: "Today" }));
    expect(date.value).toBe(todayIso());
  });

  it("keeps the form open and resets it with Add another", async () => {
    server.use(
      categories(),
      http.post(`${BASE}/api/expense`, () =>
        HttpResponse.json(
          { id: "n2", version: 0, description: "Bus", amount: 3, category: "TRANSPORT", date: todayIso(), createdAt: "2026-10-18T09:00:00", lastModified: null },
          { status: 201 },
        ),
      ),
    );
    renderAt("/expenses/new");
    await screen.findByRole("group", { name: "Category" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Add another" }));
    fill({ description: "Bus", amount: "3", category: "TRANSPORT" });
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect((await screen.findByRole("status")).textContent).toBe("Added Bus · 3.00");
    expect(screen.getByRole("heading", { name: "New expense" })).toBeTruthy();
    expect((screen.getByLabelText("Description") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("radio", { name: "Transport" }) as HTMLInputElement).checked).toBe(false);
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
    await screen.findByRole("group", { name: "Category" });
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
    await screen.findByRole("group", { name: "Category" });
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
    await screen.findByRole("group", { name: "Category" });
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
    await screen.findByRole("group", { name: "Category" });
    expect(input("Description").value).toBe("");
    expect(input("Amount").value).toBe("");
    expect(input("Date").value).toBe("");
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);
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
        HttpResponse.json(EMPTY_PAGE),
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

  it("DELETEs with ?version=, invalidates both lists and returns to the list", async () => {
    let query: string | null = null;
    server.use(
      detail(),
      http.delete(`${BASE}/api/expense/e1`, ({ request }) => {
        query = new URL(request.url).search;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${BASE}/api/expense`, () =>
        HttpResponse.json(EMPTY_PAGE),
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
