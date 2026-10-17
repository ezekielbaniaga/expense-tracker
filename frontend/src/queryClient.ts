import { QueryClient } from "@tanstack/react-query";

/** The app's one Query cache; login and logout clear it through AuthProvider. */
export const queryClient = new QueryClient();
