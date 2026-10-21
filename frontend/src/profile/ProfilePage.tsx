import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useLocation } from "react-router-dom";
import { ApiError, fieldErrors } from "../api/errors";
import { formatLocalDateTime, formatMonthYear, formatRelativeTime } from "../format/dates";
import { deviceName } from "../format/userAgent";
import { type RevokedSessionsDto, type SessionDto, type UpdateMeRequest, type UserDto } from "../api/user";
import { useMe } from "./useMe";
import { useAuth } from "../auth/AuthProvider";
import { tooManyAttemptsMessage } from "../auth/LoginPage";
import { errorMessage } from "../expenses/ExpenseListPage";
import { Button } from "../ui/Button";
import { PageHeading, useRefocusOnClose } from "../ui/focus";
import { SelectField, TextField } from "../ui/fields";
import { usePreferences } from "../ui/preferences";
import { FormAlert } from "../ui/forms";
import { useToast } from "../ui/Toast";
import { validateChangePassword, type ChangePasswordFormValues } from "./changePasswordSchema";
import { Skeleton } from "../ui/Skeleton";
import { Avatar } from "../ui/Avatar";
import { SegmentedControl } from "../ui/Chip";
import { THEME_OPTIONS } from "../ui/AccountMenu";
import { ACCENTS, type Accent, type Theme } from "../ui/theme";

const FIELDS = ["currentPassword", "newPassword"] as const;
type Field = (typeof FIELDS)[number];

export function ProfilePage() {
  const toast = useToast();
  const query = useMe();

  const failure = query.error;
  useEffect(() => {
    if (failure) toast.showError(`Could not load your profile. ${errorMessage(failure)}`);
  }, [failure, toast]);

  const me = query.data;
  return (
    <>
      <section aria-labelledby="profile-heading">
        <PageHeading id="profile-heading">Profile</PageHeading>
        {query.isPending && <Skeleton label="Loading profile..." />}
        {query.isError && (
          <p>
            Your profile could not be loaded.{" "}
            <button type="button" onClick={() => void query.refetch()}>
              Retry
            </button>
          </p>
        )}
        {me && (
          <div className="card">
            <h2 className="card__title">Account</h2>
            <Avatar name={me.displayName ?? me.username} id={me.id} className="avatar--lg" />
            <dl>
              <dt>Username</dt>
              <dd>{me.username}</dd>
              <dt>Name</dt>
              <dd>
                <DisplayNameEditor displayName={me.displayName} />
              </dd>
              <dt>Role</dt>
              <dd>{me.role}</dd>
              <dt>Member since</dt>
              <dd>{formatMonthYear(me.createdAt)}</dd>
            </dl>
          </div>
        )}
      </section>
      <AppearanceSection />
      <ChangePasswordSection username={me?.username} />
      <DevicesSection />
    </>
  );
}

/** Shows the display name with Edit, or "Add your name"; saving PATCHes /users/me. */
// Mirrors DisplayNameValidator on the backend, which stays authoritative
const INVISIBLE_FORMATTING = /[\p{Cf}\p{Zl}\p{Zp}]/u;
const CONTROL = /\p{Cc}/u;
const VISIBLE = /[^\s\p{Z}\p{Cf}\p{Cc}]/u;
// Java's strip() drops whitespace but keeps no-break spaces; String.trim() would drop those too
const JAVA_WHITESPACE = "\\t-\\r\\u001c-\\u001f \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000";
const EDGE_WHITESPACE = new RegExp(`^[${JAVA_WHITESPACE}]+|[${JAVA_WHITESPACE}]+$`, "gu");

const DISPLAY_NAME_MESSAGE = "Name can't contain control or invisible characters, or be blank.";

function displayNameProblem(raw: string): string | undefined {
  const stripped = raw.replace(EDGE_WHITESPACE, "");
  if (INVISIBLE_FORMATTING.test(raw)) return DISPLAY_NAME_MESSAGE; // U+2028/U+2029 would otherwise strip to ""
  if (stripped === "") return undefined; // clears the name
  return CONTROL.test(stripped) || !VISIBLE.test(stripped) ? DISPLAY_NAME_MESSAGE : undefined;
}

function DisplayNameEditor({ displayName }: { displayName: string | null }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>();
  const opener = useRefocusOnClose<HTMLButtonElement>(editing);

  const save = useMutation({
    mutationFn: (name: string) =>
      client.request<UserDto>("/users/me", { method: "PATCH", body: { displayName: name } satisfies UpdateMeRequest }),
    onSuccess: (user) => {
      queryClient.setQueryData(["me"], user);
      setEditing(false);
      toast.showSuccess(user.displayName ? "Name saved." : "Name removed.");
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 400 && failure.code === "INVALID_DISPLAY_NAME") {
        setError(failure.messages[0] ?? "Invalid name");
      } else {
        setError(`Could not save your name. ${errorMessage(failure)}`);
      }
    },
  });

  if (!editing) {
    return (
      <>
        {displayName && <span>{displayName} </span>}
        <button
          type="button"
          ref={opener}
          onClick={() => {
            setValue(displayName ?? "");
            setError(undefined);
            save.reset();
            setEditing(true);
          }}
        >
          {displayName ? "Edit" : "Add your name"}
        </button>
      </>
    );
  }
  return (
    <form
      aria-label="Edit name"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const problem = displayNameProblem(value);
        setError(problem);
        if (!problem) save.mutate(value.replace(EDGE_WHITESPACE, ""));
      }}
    >
      <TextField
        label="Name"
        id="displayName"
        autoComplete="name"
        maxLength={100}
        autoFocus
        value={value}
        error={error}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" variant="primary" pending={save.isPending}>
        Save
      </Button>{" "}
      <Button type="button" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}

/** ISO 4217 codes offered for the display currency; empty means no symbol. */
const CURRENCIES = ["PHP", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "INR", "CNY"];

function AppearanceSection() {
  const prefs = usePreferences();
  const { currency, setCurrency } = prefs;
  // A code saved earlier that is not in the list stays selectable
  const options = currency && !CURRENCIES.includes(currency) ? [currency, ...CURRENCIES] : CURRENCIES;
  return (
    <section className="card" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="card__title">
        Appearance
      </h2>
      <SegmentedControl
        legend="Theme"
        name="profile-theme"
        options={THEME_OPTIONS}
        value={prefs.theme}
        onChange={(v) => prefs.setTheme(v as Theme)}
      />
      <fieldset className="swatches">
        <legend className="field-label">Accent</legend>
        <div className="swatches__row">
          {ACCENTS.map((a: Accent) => (
            <label key={a} className={`swatch swatch--${a}${prefs.accent === a ? " swatch--selected" : ""}`}>
              <input
                className="swatch__input"
                type="radio"
                name="profile-accent"
                value={a}
                checked={prefs.accent === a}
                aria-label={a[0].toUpperCase() + a.slice(1)}
                onChange={() => prefs.setAccent(a)}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <SelectField id="display-currency" label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
        <option value="">None</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </SelectField>
      <p>Only changes how amounts look. Amounts are saved as numbers.</p>
    </section>
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
    <section className="card" aria-labelledby="password-heading">
      <h2 id="password-heading" className="card__title">
        Security
      </h2>
      <p role="note">Warning: changing your password signs you out on every device, this one too.</p>
      <form aria-label="Change password" onSubmit={onSubmit} noValidate>
        <TextField
          label="Current password"
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register("currentPassword")}
        />

        <TextField
          label="New password"
          id="newPassword"
          type="password"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />

        {serverError && <FormAlert>{serverError}</FormAlert>}
        <Button type="submit" variant="primary" pending={isSubmitting}>
          Change password
        </Button>
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
      toast.showSuccess(`Signed out ${revoked} other device${revoked === 1 ? "" : "s"}.`);
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  // /me#devices (from the account menu): scroll to the section and move focus into it
  const { hash } = useLocation();
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash !== "#devices") return;
    section.current?.scrollIntoView?.();
    section.current?.focus();
  }, [hash]);

  return (
    <section id="devices" className="card" ref={section} tabIndex={-1} aria-labelledby="devices-heading">
      <h2 id="devices-heading" className="card__title">
        Your devices
      </h2>
      {query.isPending && <Skeleton label="Loading devices..." />}
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
  const toast = useToast();
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
      toast.showSuccess("Device signed out.");
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  return (
    <li>
      <strong>{deviceName(session.userAgent)}</strong>
      {session.current && (
        <>
          {" "}
          <em>This device</em>
        </>
      )}
      <p>
        IP {session.ipAddress ?? "unknown"}. Last active {formatRelativeTime(session.lastUsedAt)} (
        {formatLocalDateTime(session.lastUsedAt)}), signed in {formatLocalDateTime(session.createdAt)}, expires{" "}
        {formatLocalDateTime(session.expiresAt)}
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
