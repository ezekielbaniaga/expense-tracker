import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "../App";
import { createApiClient } from "../api/client";
import { fakeJwt } from "../test/fakeJwt";
import { PageHeading } from "./focus";
import { Layout } from "./Layout";

let role = "USER";
const server = setupServer(
  http.post("http://localhost/auth/refresh", () =>
    HttpResponse.json({
      accessToken: fakeJwt({ sub: "alice", role }),
      accessTokenExpiresIn: 900,
      refreshTokenExpiresAt: "2026-11-17T00:00:00",
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

function renderLayout(path: string) {
  const client = createApiClient({
    baseUrl: "http://localhost",
    scheduler: () => () => {},
    locks: null,
    createChannel: null,
  });
  render(
    <AppProviders client={client} queryClient={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<PageHeading>Expenses</PageHeading>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
  return client;
}

function Broken(): never {
  throw new Error("boom");
}

describe("Layout", () => {
  it("keeps the nav and shows a fallback when a page throws, and recovers on navigation", async () => {
    // React logs every caught render error
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createApiClient({
      baseUrl: "http://localhost",
      scheduler: () => () => {},
      locks: null,
      createChannel: null,
    });
    render(
      <AppProviders client={client} queryClient={new QueryClient()}>
        <MemoryRouter initialEntries={["/broken"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<p>Fine page</p>} />
              <Route path="/broken" element={<Broken />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppProviders>,
    );
    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Back to expenses" }));
    expect(await screen.findByText("Fine page")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Something went wrong" })).toBeNull();
    client.dispose();
    vi.restoreAllMocks();
  });

  it("has one Main nav, one h1, the skip link first and Admin only for ADMIN", async () => {
    role = "USER";
    let client = renderLayout("/");
    await screen.findByRole("button", { name: "Sign out" });
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Expense Tracker" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add expense" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    expect(document.body.querySelector("a")?.textContent).toBe("Skip to content");
    cleanup();
    client.dispose();

    role = "ADMIN";
    client = renderLayout("/");
    expect(await screen.findByRole("link", { name: "Admin" })).toBeTruthy();
    expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(1);
    client.dispose();
    role = "USER";
  });
});
