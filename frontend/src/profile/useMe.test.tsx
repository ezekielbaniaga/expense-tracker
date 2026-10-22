import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { UserDto } from "../api/user";
import { ME_KEY, useCachedMe } from "./useMe";

const user: UserDto = { id: "u-1", username: "alice", role: "USER", createdAt: "2026-01-02T03:04:05.678", displayName: "Al" };

describe("useCachedMe", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stays silent and never fetches while the cache is empty, then picks up data set elsewhere", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCachedMe(), { wrapper });
    expect(result.current).toBeUndefined();

    act(() => {
      queryClient.setQueryData(ME_KEY, user);
    });
    await waitFor(() => expect(result.current).toEqual(user));

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
