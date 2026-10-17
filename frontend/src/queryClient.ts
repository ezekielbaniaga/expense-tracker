import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/errors";

/** The app's one Query cache; login and logout clear it through AuthProvider. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying a 4xx (a missing expense, say) cannot change the answer
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 3,
    },
  },
});
