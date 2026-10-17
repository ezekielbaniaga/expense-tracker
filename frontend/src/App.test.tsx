import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import App from "./App";
import { createApiClient } from "./api/client";

const server = setupServer(
  http.post("http://localhost/auth/refresh", () =>
    HttpResponse.json({ code: "AUTHENTICATION_REQUIRED", messages: [] }, { status: 401 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

describe("App", () => {
  it("boots without a session into the login page", async () => {
    const client = createApiClient({ baseUrl: "http://localhost", locks: null, createChannel: null });
    render(<App client={client} queryClient={new QueryClient()} />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    client.dispose();
  });
});
