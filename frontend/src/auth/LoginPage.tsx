import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/errors";
import { useAuth } from "./AuthProvider";
import { Button } from "../ui/Button";
import { TextField } from "../ui/fields";
import { FormAlert } from "../ui/forms";
import { PageHeading } from "../ui/focus";
import type { FromState } from "./RequireAuth";

interface LoginForm {
  username: string;
  password: string;
}

/** The 429 text for the login and register pages. */
export function tooManyAttemptsMessage(error: ApiError): string {
  return error.retryAfter === undefined
    ? "Too many attempts, try again later"
    : `Too many attempts, try again in ${error.retryAfter} s`;
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // Nothing more specific than this on 401, so the page never says which part was wrong
    if (error.status === 401) return "Invalid username or password";
    if (error.status === 429) return tooManyAttemptsMessage(error);
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
      <PageHeading>Sign in</PageHeading>
      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Username"
          id="username"
          autoComplete="username"
          error={errors.username?.message}
          {...register("username", {
            validate: (v) => v.trim() !== "" || "Username is required",
          })}
        />

        <TextField
          label="Password"
          id="password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password", {
            validate: (v) => v.trim() !== "" || "Password is required",
          })}
        />

        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Button type="submit" variant="primary" pending={isSubmitting}>
          Sign in
        </Button>
      </form>
      <p>
        No account? <Link to="/register">Create an account</Link>
      </p>
    </main>
  );
}
