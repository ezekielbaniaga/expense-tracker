import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError, fieldErrors } from "../api/errors";
import { useAuth } from "./AuthProvider";
import { tooManyAttemptsMessage } from "./LoginPage";
import { toRegisterRequest, validateRegister, type RegisterFormValues } from "./registerSchema";

const FIELDS = ["username", "password"] as const;
type Field = (typeof FIELDS)[number];

const resolver: Resolver<RegisterFormValues> = (values) => {
  const messages = validateRegister(values);
  const errors = Object.fromEntries(
    Object.entries(messages).map(([name, message]) => [name, { type: "validate", message }]),
  );
  return Object.keys(errors).length === 0 ? { values, errors: {} } : { values: {}, errors };
};

/** Where a register failure goes: on a field, or as the form-level text. */
function registerFailure(error: unknown): { field?: Field; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === "USERNAME_TAKEN") {
      return { field: "username", message: "Username is already taken" };
    }
    if (error.status === 400 && error.code === "INVALID_USERNAME") {
      return { field: "username", message: error.messages[0] ?? "Invalid username" };
    }
    if (error.status === 400 && error.code === "INVALID_PASSWORD") {
      return { field: "password", message: error.messages[0] ?? "Invalid password" };
    }
    if (error.status === 429) return { message: tooManyAttemptsMessage(error) };
  }
  return { message: "Something went wrong, try again" };
}

export function RegisterPage() {
  const { state, client, login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver, defaultValues: { username: "", password: "" } });

  if (state.status === "authenticated" && !isSubmitting) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const body = toRegisterRequest(values);
    try {
      // 201 with the new user and no tokens; the login below starts the session
      await client.request("/auth/register", { method: "POST", body });
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.code === "VALIDATION_ERROR") {
        const { fields, form } = fieldErrors(error);
        const rest = [...form];
        for (const [name, message] of Object.entries(fields)) {
          if ((FIELDS as readonly string[]).includes(name)) {
            setError(name as Field, { type: "server", message });
          } else {
            rest.push(`${name}: ${message}`);
          }
        }
        if (rest.length > 0) setServerError(rest.join(" "));
        return;
      }
      const { field, message } = registerFailure(error);
      if (field) setError(field, { type: "server", message });
      else setServerError(message);
      return;
    }
    try {
      await login(body.username, body.password);
      navigate("/", { replace: true });
    } catch {
      // The account exists now, so submitting again would only say the name is taken
      setServerError("Account created, but signing in failed. Sign in to continue.");
    }
  });

  return (
    <main>
      <h1>Create account</h1>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoComplete="username"
          aria-invalid={errors.username ? true : undefined}
          {...register("username")}
        />
        {errors.username && <p>{errors.username.message}</p>}

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          {...register("password")}
        />
        {errors.password && <p>{errors.password.message}</p>}

        {serverError && <p role="alert">{serverError}</p>}
        <button type="submit" disabled={isSubmitting}>
          Create account
        </button>
      </form>
      <p>
        Have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
