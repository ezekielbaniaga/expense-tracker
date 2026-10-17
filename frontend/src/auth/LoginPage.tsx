import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/errors";
import { useAuth } from "./AuthProvider";
import type { FromState } from "./RequireAuth";

interface LoginForm {
  username: string;
  password: string;
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // Nothing more specific than this on 401, so the page never says which part was wrong
    if (error.status === 401) return "Invalid username or password";
    if (error.status === 429) {
      return error.retryAfter === undefined
        ? "Too many attempts, try again later"
        : `Too many attempts, try again in ${error.retryAfter} s`;
    }
  }
  return "Something went wrong, try again";
}

export function LoginPage() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as FromState | null)?.from ?? { pathname: "/" };
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { username: "", password: "" } });

  if (state.status === "authenticated" && !isSubmitting) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setServerError(null);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (error) {
      setServerError(loginErrorMessage(error));
    }
  });

  return (
    <main>
      <h1>Sign in</h1>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoComplete="username"
          aria-invalid={errors.username ? true : undefined}
          {...register("username", {
            validate: (v) => v.trim() !== "" || "Username is required",
          })}
        />
        {errors.username && <p>{errors.username.message}</p>}

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          {...register("password", {
            validate: (v) => v.trim() !== "" || "Password is required",
          })}
        />
        {errors.password && <p>{errors.password.message}</p>}

        {serverError && <p role="alert">{serverError}</p>}
        <button type="submit" disabled={isSubmitting}>
          Sign in
        </button>
      </form>
    </main>
  );
}
