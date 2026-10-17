import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { ApiError, fieldErrors } from "../api/errors";
import { formatTimestamp, type RevokedSessionsDto, type SessionDto, type UserDto } from "../api/user";
import { useAuth } from "../auth/AuthProvider";
import { tooManyAttemptsMessage } from "../auth/LoginPage";
import { errorMessage } from "../expenses/ExpenseListPage";
import { PageHeading, useRefocusOnClose } from "../ui/focus";
import { FieldError, errorProps, FormAlert } from "../ui/forms";
import { useToast } from "../ui/Toast";
import { validateChangePassword, type ChangePasswordFormValues } from "./changePasswordSchema";

const FIELDS = ["currentPassword", "newPassword"] as const;
type Field = (typeof FIELDS)[number];

export function ProfilePage() {
  const { client } = useAuth();
  const toast = useToast();
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => client.request<UserDto>("/users/me"),
  });

  const failure = query.error;
  useEffect(() => {
    if (failure) toast.showError(`Could not load your profile. ${errorMessage(failure)}`);
  }, [failure, toast]);

  const me = query.data;
  return (
    <>
      <section aria-labelledby="profile-heading">
        <PageHeading id="profile-heading">Profile</PageHeading>
        {query.isPending && <p role="status">Loading profile...</p>}
        {query.isError && (
          <p>
            Your profile could not be loaded.{" "}
            <button type="button" onClick={() => void query.refetch()}>
              Retry
            </button>
          </p>
        )}
        {me && (
          <dl>
            <dt>Username</dt>
            <dd>{me.username}</dd>
            <dt>Role</dt>
            <dd>{me.role}</dd>
            <dt>Member since</dt>
            <dd>{formatTimestamp(me.createdAt)}</dd>
          </dl>
        )}
      </section>
      <ChangePasswordSection username={me?.username} />
      <DevicesSection />
    </>
  );
}

/** Where a password change failure goes: on a field, or as the form-level text. */
function changePasswordFailure(error: unknown): { field?: Field; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.code === "INVALID_CURRENT_PASSWORD") {
      return { field: "currentPassword", message: "Current password is incorrect" };
    }
    if (error.status === 400 && error.code === "INVALID_PASSWORD") {
      return { field: "newPassword", message: error.messages[0] ?? "Invalid password" };
    }
    // After 5 wrong current passwords; Retry-After says how long the lock lasts
    if (error.status === 429) return { message: tooManyAttemptsMessage(error) };
  }
  return { message: "Something went wrong, try again" };
}

function ChangePasswordSection({ username }: { username: string | undefined }) {
  const { state, client, logout } = useAuth();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  // /users/me is the authority; the token's name covers the moment before it loads
  const usernameRef = useRef("");
  usernameRef.current = username ?? (state.status === "authenticated" ? state.username : "");

  const resolver: Resolver<ChangePasswordFormValues> = (values) => {
    const messages = validateChangePassword(values, usernameRef.current);
    const errors = Object.fromEntries(
      Object.entries(messages).map(([name, message]) => [name, { type: "validate", message }]),
    );
    return Object.keys(errors).length === 0 ? { values, errors: {} } : { values: {}, errors };
  };

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver,
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await client.request<void>("/users/me/password", { method: "POST", body: values });
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
      const { field, message } = changePasswordFailure(error);
      if (field) setError(field, { type: "server", message }, { shouldFocus: true });
      else setServerError(message);
      return;
    }
    // The server revoked every session, this one too, so the refresh cookie is
    // dead. Sign out like the menu does; RequireAuth then goes to /login. The
    // toast lives above the routes, so it is still there on the login page
    toast.showError("Password changed. Sign in with your new password.");
    await logout();
  });

  return (
    <section aria-labelledby="password-heading">
      <h2 id="password-heading">Change password</h2>
      <p>Changing your password signs you out on every device, this one too.</p>
      <form aria-labelledby="password-heading" onSubmit={onSubmit} noValidate>
        <label htmlFor="currentPassword">Current password</label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          {...errorProps("currentPassword", errors.currentPassword?.message)}
          {...register("currentPassword")}
        />
        <FieldError id="currentPassword" message={errors.currentPassword?.message} />

        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...errorProps("newPassword", errors.newPassword?.message)}
          {...register("newPassword")}
        />
        <FieldError id="newPassword" message={errors.newPassword?.message} />

        {serverError && <FormAlert>{serverError}</FormAlert>}
        <button type="submit" disabled={isSubmitting}>
          Change password
        </button>
      </form>
    </section>
  );
}

function DevicesSection() {
  const { client, logout } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const signOutOthers = useRefocusOnClose<HTMLButtonElement>(confirming);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["sessions"],
    queryFn: () => client.request<SessionDto[]>("/users/me/sessions"),
  });

  const failure = query.error;
  useEffect(() => {
    if (failure) toast.showError(`Could not load your devices. ${errorMessage(failure)}`);
  }, [failure, toast]);

  const sessions = query.data ?? [];
  const revokeOthers = useMutation({
    mutationFn: () => client.request<RevokedSessionsDto>("/users/me/sessions", { method: "DELETE" }),
    onSuccess: async ({ revoked }) => {
      setConfirming(false);
      // A token without a sid has no current session, and then the server
      // revokes every session, its own included
      if (!sessions.some((s) => s.current)) {
        await logout();
        return;
      }
      setNotice(`Signed out ${revoked} other device${revoked === 1 ? "" : "s"}.`);
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  return (
    <section aria-labelledby="devices-heading">
      <h2 id="devices-heading">Your devices</h2>
      {query.isPending && <p role="status">Loading devices...</p>}
      {query.isError && (
        <p>
          Your devices could not be loaded.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {query.isSuccess && (
        <ul aria-labelledby="devices-heading">
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </ul>
      )}
      {notice && <p role="status">{notice}</p>}
      {sessions.some((s) => !s.current) &&
        (confirming ? (
          <div>
            <p>Sign out every device except this one?</p>
            {revokeOthers.isError && (
              <p role="alert">Could not sign out the other devices. {errorMessage(revokeOthers.error)}</p>
            )}
            <button
              type="button"
              disabled={revokeOthers.isPending}
              onClick={() => {
                setNotice(null);
                revokeOthers.mutate();
              }}
            >
              Confirm sign out
            </button>{" "}
            <button
              type="button"
              autoFocus
              onClick={() => {
                revokeOthers.reset();
                setConfirming(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" ref={signOutOthers} onClick={() => setConfirming(true)}>
            Sign out other devices
          </button>
        ))}
    </section>
  );
}

function SessionItem({ session }: { session: SessionDto }) {
  const { client, logout } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const revokeButton = useRefocusOnClose<HTMLButtonElement>(confirming);
  const revoke = useMutation({
    mutationFn: () =>
      client.request<void>(`/users/me/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      // The server ends this session like logout: its refresh cookie is dead, so sign out
      if (session.current) {
        await logout();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  return (
    <li>
      <strong>{session.userAgent ?? "Unknown device"}</strong>
      {session.current && (
        <>
          {" "}
          <em>This device</em>
        </>
      )}
      <p>
        IP {session.ipAddress ?? "unknown"}, last used {formatTimestamp(session.lastUsedAt)}, signed in{" "}
        {formatTimestamp(session.createdAt)}, expires {formatTimestamp(session.expiresAt)} (UTC)
      </p>
      {confirming ? (
        <div>
          <p>
            {session.current
              ? "Revoke this device? It signs you out here."
              : "Revoke this device? It stays signed in only until its access token runs out, at most 15 minutes."}
          </p>
          {revoke.isError && <p role="alert">Could not revoke the device. {errorMessage(revoke.error)}</p>}
          <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
            Confirm revoke
          </button>{" "}
          <button
            type="button"
            autoFocus
            onClick={() => {
              revoke.reset();
              setConfirming(false);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" ref={revokeButton} onClick={() => setConfirming(true)}>
          Revoke
        </button>
      )}
    </li>
  );
}
