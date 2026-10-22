import { skipToken, useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import type { UserDto } from "../api/user";

export const ME_KEY = ["me"] as const;

/** `GET /users/me`, cached under `["me"]`. */
export function useMe() {
  const { client } = useAuth();
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => client.request<UserDto>("/users/me"),
  });
}

/** Whatever `["me"]` holds already; never fetches (the app shell must not).
 * `skipToken` rather than `enabled: false`: no `queryFn` makes TanStack log a console error. */
export function useCachedMe(): UserDto | undefined {
  return useQuery<UserDto>({ queryKey: ME_KEY, queryFn: skipToken }).data;
}
