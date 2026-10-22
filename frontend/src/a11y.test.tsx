import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { configureAxe } from "vitest-axe";
import { AppProviders, AppRoutes } from "./App";
import { createApiClient, type ApiClient } from "./api/client";
import { fakeJwt } from "./test/fakeJwt";

const BASE = "http://localhost";
// jsdom does no layout, so it cannot compute colour contrast
const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

const server = setupServer(
  http.get(`${BASE}/api/expense/summary`, () =>
    HttpResponse.json({ from: null, to: null, count: 0, total_amount: 0, by_category: [] }),
  ),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${BASE}/api/expense/categories`, () =>
    HttpResponse.json({ supported_categories: ["FOOD", "TRANSPORT"] }),
  ),
  http.get(`${BASE}/api/expense`, () =>
    HttpResponse.json({
      expenses: [{ id: "e1", description: "Lunch", amount: 12.5, category: "FOOD", date: "2026-10-17", version: 0 }],
      page: 0,
      size: 20,
      total: 1,
      total_pages: 1,
      total_amount: 12.5,
    }),
  ),
  http.get(`${BASE}/api/expense/archived`, () =>
    HttpResponse.json({
      expenses: [{ id: "e9", description: "Old", amount: 1, archivedAt: "2026-10-01T08:00:00" }],
    }),
  ),
  http.get(`${BASE}/api/expense/e1`, () => HttpResponse.json(EXPENSE)),
  http.get(`${BASE}/users/me`, () =>
    HttpResponse.json({ id: "u-1", username: "alice", role: "ADMIN", createdAt: "2026-01-02T03:04:05.678" }),
  ),
  http.get(`${BASE}/users/me/sessions`, () => HttpResponse.json([THIS_DEVICE, PHONE])),
  http.get(`${BASE}/users`, () => HttpResponse.json({ users: [BOB], page: 0, size: 20, total: 1, totalPages: 1 })),
  http.get(`${BASE}/users/u-2`, () => HttpResponse.json(BOB)),
);

const EXPENSE = {
  id: "e1",
  version: 0,
  description: "Lunch",
  amount: 12.5,
  category: "FOOD",
  date: "2026-10-17",
  createdAt: "2026-10-17T12:00:00",
  lastModified: "2026-10-17T12:00:00",
};
const THIS_DEVICE = {
  id: "s-1",
  createdAt: "2026-10-01T08:00:00",
  lastUsedAt: "2026-10-18T09:05:03.123",
  expiresAt: "2026-10-31T08:00:00",
  userAgent: "Firefox on Linux",
  ipAddress: "10.0.0.1",
  current: true,
};
const PHONE = { ...THIS_DEVICE, id: "s-2", userAgent: "Safari on iPhone", current: false };
const BOB = {
  id: "u-2",
  username: "bob",
  role: "USER",
  enabled: true,
  version: 3,
  createdAt: "2026-02-03T04:05:06",
  lastModified: null,
};

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function error(status: number, code: string, messages: string[] = [code]) {
  return HttpResponse.json({ code, messages, timestamp: "x" }, { status });
}

function signedIn() {
  server.use(
    http.post(`${BASE}/auth/refresh`, () =>
      HttpResponse.json({
        accessToken: fakeJwt({ sub: "alice", role: "ADMIN" }),
        accessTokenExpiresIn: 900,
        refreshTokenExpiresAt: "2026-11-17T00:00:00",
      }),
    ),
  );
}

function signedOut() {
  server.use(http.post(`${BASE}/auth/refresh`, () => error(401, "AUTHENTICATION_REQUIRED")));
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

async function renderAt(path: string, heading: string) {
  const view = render(
    <AppProviders client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
  await screen.findByRole("heading", { name: heading });
  return view;
}

function type(label: string, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

describe("axe", () => {
  it("finds no violations on the login page", async () => {
    signedOut();
    const { container } = await renderAt("/login", "Sign in");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds no violations on the register page, with errors shown", async () => {
    signedOut();
    const { container } = await renderAt("/register", "Create account");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByLabelText("Username", { selector: "[aria-invalid=true]" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds no violations on the expense list", async () => {
    signedIn();
    const { container } = await renderAt("/", "Expenses");
    await screen.findByRole("link", { name: "Lunch" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds no violations on the archived list", async () => {
    signedIn();
    const { container } = await renderAt("/archived", "Archived expenses");
    await screen.findByText("Old");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds no violations on the create form, with errors shown", async () => {
    signedIn();
    const { container } = await renderAt("/expenses/new", "New expense");
    fireEvent.click(await screen.findByRole("button", { name: "Add expense" }));
    await screen.findByLabelText("Amount", { selector: "[aria-invalid=true]" });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds no violations on the expense page in view, edit and delete mode", async () => {
    signedIn();
    const { container } = await renderAt("/expenses/e1", "Lunch");
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByRole("group", { name: "Category" });
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds no violations on the profile page, with the revoke confirm open", async () => {
    signedIn();
    const { container } = await renderAt("/me", "Profile");
    await screen.findByText("Safari on iPhone");
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" })[1]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds no violations on the admin pages", async () => {
    signedIn();
    const { container } = await renderAt("/admin/users", "Users");
    await screen.findByRole("link", { name: "bob" });
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole("link", { name: "bob" }));
    await screen.findByRole("heading", { name: "bob" });
    fireEvent.click(screen.getByRole("radio", { name: "ADMIN" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("labels", () => {
  it("gives every input of the password form a label", async () => {
    signedIn();
    await renderAt("/me", "Profile");
    expect(screen.getByLabelText("Current password")).toBeTruthy();
    expect(screen.getByLabelText("New password")).toBeTruthy();
  });

  it("gives every input of the expense form a label", async () => {
    signedIn();
    await renderAt("/expenses/new", "New expense");
    for (const name of ["Description", "Amount"]) {
      expect(await screen.findByRole("textbox", { name })).toBeTruthy();
    }
    expect(screen.getByRole("radio", { name: "Food" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Category" })).toBeTruthy();
    expect(screen.getByLabelText("Date")).toBeTruthy();
  });

  it("names the main landmarks and the table scroll boxes", async () => {
    signedIn();
    await renderAt("/", "Expenses");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(await screen.findByRole("region", { name: "Expenses table" })).toBeTruthy();
  });

  it("ties a field error to its input", async () => {
    signedOut();
    await renderAt("/login", "Sign in");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const username = await screen.findByLabelText("Username");
    expect(username.getAttribute("aria-invalid")).toBe("true");
    const described = document.getElementById(username.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe("Username is required");
  });
});

describe("focus after navigation", () => {
  it("moves to the new page's heading, but not on the first load", async () => {
    signedIn();
    await renderAt("/", "Expenses");
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("link", { name: "Archived" }));
    const heading = await screen.findByRole("heading", { name: "Archived expenses" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    const profile = await screen.findByRole("heading", { name: "Profile" });
    await waitFor(() => expect(document.activeElement).toBe(profile));
  });

  it("does not pull focus back when the page refetches", async () => {
    signedIn();
    await renderAt("/", "Expenses");
    fireEvent.click(screen.getByRole("link", { name: "Archived" }));
    await screen.findByText("Old");
    screen.getByRole("link", { name: "Expenses" }).focus();
    await queryClient.invalidateQueries({ queryKey: ["archived"] });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Expenses" }));
  });

  it("Skip to content focuses the main landmark", async () => {
    signedIn();
    await renderAt("/", "Expenses");
    fireEvent.click(screen.getByRole("link", { name: "Skip to content" }));
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });
});

describe("focus after a failed submit", () => {
  it("login: the first invalid field, then the server error", async () => {
    signedOut();
    await renderAt("/login", "Sign in");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Username")));

    server.use(http.post(`${BASE}/auth/login`, () => error(401, "BAD_CREDENTIALS")));
    type("Username", "alice");
    type("Password", "wrong-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("register: the first invalid field, then a field the server rejects", async () => {
    signedOut();
    await renderAt("/register", "Create account");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Username")));

    server.use(http.post(`${BASE}/auth/register`, () => error(409, "USERNAME_TAKEN")));
    type("Username", "carol");
    type("Password", "a-long-enough-password");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText("Username is already taken");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Username")));
  });

  it("create expense: the first invalid field, then the form error", async () => {
    signedIn();
    await renderAt("/expenses/new", "New expense");
    fireEvent.click(await screen.findByRole("button", { name: "Add expense" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Amount")));

    server.use(http.post(`${BASE}/api/expense`, () => error(400, "INVALID_CATEGORY", ["Invalid category: FOOD"])));
    type("Description", "Lunch");
    type("Amount", "12.50");
    fireEvent.click(screen.getByRole("radio", { name: "Food" }));
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("change password: the first invalid field, then a field the server rejects", async () => {
    signedIn();
    await renderAt("/me", "Profile");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Current password")));

    server.use(http.post(`${BASE}/users/me/password`, () => error(400, "INVALID_CURRENT_PASSWORD")));
    type("Current password", "not-my-password");
    type("New password", "a-long-enough-password");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await screen.findByText("Current password is incorrect");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Current password")));
  });
});

describe("focus around inline confirms", () => {
  it("delete: Cancel takes focus, and Delete gets it back", async () => {
    signedIn();
    await renderAt("/expenses/e1", "Lunch");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete" })));
  });

  it("revoke a device: Cancel takes focus, and Revoke gets it back", async () => {
    signedIn();
    await renderAt("/me", "Profile");
    await screen.findByText("Safari on iPhone");
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" })[1]);
    const cancel = screen.getAllByRole("button", { name: "Cancel" })[0];
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Revoke"));
  });

  it("demote a user: Cancel takes focus, and Save gets it back", async () => {
    signedIn();
    server.use(http.get(`${BASE}/users/u-2`, () => HttpResponse.json({ ...BOB, role: "ADMIN" })));
    await renderAt("/admin/users/u-2", "bob");
    fireEvent.click(screen.getByRole("radio", { name: "USER" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" })));
  });
});
