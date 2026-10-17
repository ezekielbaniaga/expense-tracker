import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { apiClient, type ApiClient } from "./api/client";
import { AuthProvider } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { RegisterPage } from "./auth/RegisterPage";
import { RequireAuth } from "./auth/RequireAuth";
import { ArchivedPage } from "./expenses/ArchivedPage";
import { CreateExpensePage } from "./expenses/CreateExpensePage";
import { ExpenseListPage } from "./expenses/ExpenseListPage";
import { ExpenseDetailPage } from "./expenses/ExpenseDetailPage";
import { ProfilePage } from "./profile/ProfilePage";
import { queryClient as appQueryClient } from "./queryClient";
import { Layout } from "./ui/Layout";
import { ToastProvider } from "./ui/Toast";

interface ProviderProps {
  client: ApiClient;
  queryClient: QueryClient;
  children: ReactNode;
}

/** Query cache and auth; tests pass their own client and cache. */
export function AppProviders({ client, queryClient, children }: ProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<ExpenseListPage />} />
        <Route path="/archived" element={<ArchivedPage />} />
        <Route path="/expenses/new" element={<CreateExpensePage />} />
        <Route path="/expenses/:id" element={<ExpenseDetailPage />} />
        <Route path="/me" element={<ProfilePage />} />
      </Route>
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
