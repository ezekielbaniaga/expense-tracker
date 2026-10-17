import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { apiClient, type ApiClient } from "./api/client";
import { AuthProvider } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import { HomePage } from "./HomePage";
import { queryClient as appQueryClient } from "./queryClient";

interface ProviderProps {
  client: ApiClient;
  queryClient: QueryClient;
  children: ReactNode;
}

/** Query cache and auth; tests pass their own client and cache. */
export function AppProviders({ client, queryClient, children }: ProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={client}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App({
  client = apiClient,
  queryClient = appQueryClient,
}: {
  client?: ApiClient;
  queryClient?: QueryClient;
}) {
  return (
    <AppProviders client={client} queryClient={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
