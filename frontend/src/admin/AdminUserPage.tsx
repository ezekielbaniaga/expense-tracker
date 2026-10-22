import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/errors";
import type { Role } from "../api/jwt";
import { formatLocalDateTime } from "../format/dates";
import { type AdminUserDto, type UpdateUserRequest } from "../api/user";
import { useAuth } from "../auth/AuthProvider";
import { errorMessage } from "../expenses/ExpenseListPage";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { SegmentedControl } from "../ui/Chip";
import { ChevronLeftIcon } from "../ui/icons";
import { PageHeading, useRefocusOnClose } from "../ui/focus";
import { FormAlert } from "../ui/forms";
import { useToast } from "../ui/Toast";
import { isForbidden, NO_ADMIN_ACCESS } from "./AdminUsersPage";
import { Skeleton } from "../ui/Skeleton";
import { AdminPill } from "./AdminPill";
import { RoleChip, StatusChip } from "./UserChips";

/** 400 is a malformed id; it looks the same as an unknown one. */
function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 400);
}

export function AdminUserPage() {
  const { id = "" } = useParams();
  const { client } = useAuth();
  const toast = useToast();
  const query = useQuery({
    queryKey: ["user", id],
    queryFn: () => client.request<AdminUserDto>(`/users/${encodeURIComponent(id)}`),
  });

  const failure = query.error;
  useEffect(() => {
    if (failure && !isNotFound(failure) && !isForbidden(failure)) {
      toast.showError(`Could not load the user. ${errorMessage(failure)}`);
    }
  }, [failure, toast]);

  const user = query.data;
  return (
    <section aria-labelledby="user-heading">
      <p>
        <Link to="/admin/users" className="back-link">
          <ChevronLeftIcon size={16} />
          Back to users
        </Link>
      </p>
      {query.isPending && <Skeleton label="Loading user..." />}
      {isNotFound(failure) && <PageHeading id="user-heading">Not found</PageHeading>}
      {isForbidden(failure) && <p role="alert">{NO_ADMIN_ACCESS}</p>}
      {query.isError && !isNotFound(failure) && !isForbidden(failure) && (
        <p>
          The user could not be loaded.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {user && (
        <div className="stack">
          <Card className="user-header">
            <Avatar name={user.displayName ?? user.username} id={user.id} className="avatar--lg" />
            <div>
              <div className="admin-heading">
                <PageHeading id="user-heading">{user.username}</PageHeading>
                <AdminPill />
              </div>
              <div className="user-header__chips">
                <RoleChip role={user.role} />
                <StatusChip enabled={user.enabled} />
              </div>
            </div>
          </Card>
          <Card title="Details">
            <dl>
              <dt>Created</dt>
              <dd>{formatLocalDateTime(user.createdAt)}</dd>
              <dt>Last modified</dt>
              <dd>{user.lastModified ? formatLocalDateTime(user.lastModified) : "Never"}</dd>
            </dl>
          </Card>
          <UserForm user={user} onReload={() => void query.refetch()} />
        </div>
      )}
    </section>
  );
}

/** What the form changes, as the PATCH fields; unchanged ones are left out. */
function changesOf(user: AdminUserDto, enabled: boolean, role: Role): Omit<UpdateUserRequest, "version"> {
  return {
    ...(enabled !== user.enabled && { enabled }),
    ...(role !== user.role && { role }),
  };
}

/** The 409 guard rails and EMPTY_PATCH as text for the form. */
function saveFailure(error: unknown, username: string): string {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === "CANNOT_MODIFY_SELF") return "You cannot disable or demote yourself.";
    if (error.status === 409 && error.code === "LAST_ADMIN") {
      return `${username} is the last enabled admin, so they cannot be disabled or demoted.`;
    }
    if (error.status === 400 && error.code === "EMPTY_PATCH") {
      return "Nothing to change. Change the status or the role first.";
    }
    if (error.status === 403) return NO_ADMIN_ACCESS;
    if (error.status === 404) return "This user no longer exists.";
  }
  return "Something went wrong, try again";
}

/**
 * Status and role. The inputs are local state, so a Reload after a stale
 * version keeps them; the version comes from the cache at submit time.
 */
function UserForm({ user, onReload }: { user: AdminUserDto; onReload: () => void }) {
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(user.enabled);
  const [role, setRole] = useState<Role>(user.role);
  const [confirming, setConfirming] = useState(false);
  const saveButton = useRefocusOnClose<HTMLButtonElement>(confirming);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changes = changesOf(user, enabled, role);
  const disabling = changes.enabled === false;
  const demoting = changes.role === "USER";

  const save = useMutation({
    // Sent as is when nothing changed, so the server answers EMPTY_PATCH
    mutationFn: () =>
      client.request<AdminUserDto>(`/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: { version: user.version, ...changes } satisfies UpdateUserRequest,
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData(["user", result.id], result);
      setEnabled(result.enabled);
      setRole(result.role);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409 && error.code === "CONCURRENT_MODIFICATION") {
        setStale(true);
        return;
      }
      setMessage(saveFailure(error, user.username));
    },
    onSettled: () => setConfirming(false),
  });

  const submit = () => {
    setStale(false);
    setMessage(null);
    setSaved(false);
    save.mutate();
  };

  return (
    <form
      aria-label="Edit user"
      onSubmit={(event) => {
        event.preventDefault();
        // Disabling or demoting ends every session of the user, so ask first
        if (disabling || demoting) setConfirming(true);
        else submit();
      }}
    >
      <Card title="Access">
        <div className="stack">
          <SegmentedControl
            legend="Status"
            name="user-status"
            options={[
              { value: "true", label: "Enabled" },
              { value: "false", label: "Disabled" },
            ]}
            value={String(enabled)}
            onChange={(v) => {
              setEnabled(v === "true");
              setConfirming(false);
            }}
          />
          <SegmentedControl
            legend="Role"
            name="user-role"
            options={[
              { value: "USER", label: "USER" },
              { value: "ADMIN", label: "ADMIN" },
            ]}
            value={role}
            onChange={(v) => {
              setRole(v as Role);
              setConfirming(false);
            }}
          />
          {stale && (
            <p role="alert">
              This user was changed elsewhere. Reload to get the latest version; your changes are kept.{" "}
              <button
                type="button"
                onClick={() => {
                  setStale(false);
                  onReload();
                }}
              >
                Reload
              </button>
            </p>
          )}
          {message && <FormAlert>{message}</FormAlert>}
          {saved && <p role="status">Saved.</p>}
          <div className="form-actions">
            {confirming ? (
              <div>
                <p>
                  {disabling && demoting ? "Disable and demote" : disabling ? "Disable" : "Demote"} {user.username}?
                  Every session of theirs ends, so they have to sign in again.
                </p>
                <button type="button" disabled={save.isPending} onClick={submit}>
                  Confirm save
                </button>{" "}
                <button type="button" autoFocus onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <Button type="submit" variant="primary" ref={saveButton} pending={save.isPending}>
                Save
              </Button>
            )}
          </div>
        </div>
      </Card>
    </form>
  );
}
