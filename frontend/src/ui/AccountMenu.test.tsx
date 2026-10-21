import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppProviders } from "../App";
import { createApiClient } from "../api/client";
import { fakeJwt } from "../test/fakeJwt";
import { AccountMenu } from "./AccountMenu";

let role = "USER";
let logouts = 0;
const server = setupServer(
  http.post("http://localhost/auth/refresh", () =>
    HttpResponse.json({
      accessToken: fakeJwt({ sub: "ezekiel.baniaga", role }),
      accessTokenExpiresIn: 900,
      refreshTokenExpiresAt: "2026-11-17T00:00:00",
    }),
  ),
  http.post("http://localhost/auth/logout", () => {
    logouts++;
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  logouts = 0;
  localStorage.clear();
});

function Where() {
  const { pathname, hash } = useLocation();
  return <p data-testid="where">{pathname + hash}</p>;
}

function renderMenu() {
  const client = createApiClient({
    baseUrl: "http://localhost",
    scheduler: () => () => {},
    locks: null,
    createChannel: null,
  });
  render(
    <AppProviders client={client} queryClient={new QueryClient()}>
      <MemoryRouter initialEntries={["/"]}>
        <button>outside</button>
        <Routes>
          <Route path="*" element={<AccountMenu />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </AppProviders>,
  );
  return client;
}

const trigger = () =>
  screen.findByRole("button", { name: "Account menu for ezekiel.baniaga" });

describe("AccountMenu", () => {
  it("discloses a labelled region with the user, role and links, Admin only for ADMIN", async () => {
    role = "USER";
    let client = renderMenu();
    const button = await trigger();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "ezekiel.baniaga" })).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const region = screen.getByRole("region", { name: "ezekiel.baniaga" });
    expect(region.textContent).toContain("USER");
    expect(
      screen.getByRole("link", { name: "Profile" }).getAttribute("href"),
    ).toBe("/me");
    expect(
      screen.getByRole("link", { name: "Your devices" }).getAttribute("href"),
    ).toBe("/me#devices");
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
    cleanup();
    client.dispose();

    role = "ADMIN";
    client = renderMenu();
    fireEvent.click(await trigger());
    expect(
      screen.getByRole("link", { name: "Admin" }).getAttribute("href"),
    ).toBe("/admin/users");
    client.dispose();
    role = "USER";
  });

  it("closes on Escape and returns focus, and closes on an outside click", async () => {
    const client = renderMenu();
    const button = await trigger();
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    fireEvent.mouseDown(screen.getByRole("region", { name: "ezekiel.baniaga" }));
    expect(button.getAttribute("aria-expanded")).toBe("true");
    client.dispose();
  });

  it("changes the theme and accent, closes on navigation and signs out once", async () => {
    const client = renderMenu();
    fireEvent.click(await trigger());
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(localStorage.getItem("ui.theme")).toBe("dark");
    fireEvent.click(screen.getByRole("radio", { name: "Rose" }));
    expect(localStorage.getItem("ui.accent")).toBe("rose");

    fireEvent.click(screen.getByRole("link", { name: "Your devices" }));
    expect(screen.getByTestId("where").textContent).toBe("/me#devices");
    expect(
      screen
        .getByRole("button", { name: /^Account menu for / })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: /^Account menu for / }));
    const signOut = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(signOut);
    expect((signOut as HTMLButtonElement).disabled).toBe(true);
    await vi.waitFor(() => expect(logouts).toBe(1));
    client.dispose();
  });
});
