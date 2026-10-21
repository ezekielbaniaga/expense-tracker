import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError, fieldErrors } from "../api/errors";
import { useAuth } from "./AuthProvider";
import { Button } from "../ui/Button";
import { PageHeading } from "../ui/focus";
import { TextField } from "../ui/fields";
import { FormAlert } from "../ui/forms";
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
        let focused = false;
        for (const [name, message] of Object.entries(fields)) {
          if ((FIELDS as readonly string[]).includes(name)) {
            setError(name as Field, { type: "server", message }, { shouldFocus: !focused });
            focused = true;
          } else {
            rest.push(`${name}: ${message}`);
          }
        }
        if (rest.length > 0) setServerError(rest.join(" "));
        return;
      }
      const { field, message } = registerFailure(error);
      if (field) setError(field, { type: "server", message }, { shouldFocus: true });
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
      <PageHeading as="h1">Create account</PageHeading>
      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Username"
          id="username"
          autoComplete="username"
          error={errors.username?.message}
          {...register("username")}
        />

        <TextField
          label="Password"
          id="password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />

        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Button type="submit" variant="primary" pending={isSubmitting}>
          Create account
        </Button>
      </form>
      <p>
        Have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
