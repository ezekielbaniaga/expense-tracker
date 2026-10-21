import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/errors";
import { formatDay } from "../format/dates";
import { DEFAULT_USER_PAGE_SIZE, type UserListDto } from "../api/user";
import { useAuth } from "../auth/AuthProvider";
import { errorMessage } from "../expenses/ExpenseListPage";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { PageHeading } from "../ui/focus";
import { Pagination } from "../ui/Pagination";
import { TableScroll } from "../ui/forms";
import { useToast } from "../ui/Toast";
import { Skeleton } from "../ui/Skeleton";
import { RoleChip, StatusChip } from "./UserChips";

/**
 * The server re-checks the caller against the database, so an admin demoted or
 * disabled since their token was issued gets 403 while the token still says ADMIN.
 */
export const NO_ADMIN_ACCESS =
  "You no longer have admin access. Sign out and sign in again to see your current role.";

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

function isInvalidPage(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.code === "INVALID_PAGE";
}

/**
 * Filters and paging live in the URL so a reload or a shared link keeps them.
 * A page or size the server refuses comes back as INVALID_PAGE.
 */
function readFilters(params: URLSearchParams) {
  const int = (name: string, fallback: number) => {
    const value = params.get(name);
    return value !== null && /^-?\d+$/.test(value) ? Number(value) : fallback;
  };
  const enabled = params.get("enabled");
  return {
    username: params.get("username") ?? "",
    enabled: enabled === "true" || enabled === "false" ? enabled : "",
    page: int("page", 0),
    size: int("size", DEFAULT_USER_PAGE_SIZE),
  };
}

function usersPath({ username, enabled, page, size }: ReturnType<typeof readFilters>): string {
  const query = new URLSearchParams();
  if (username.trim() !== "") query.set("username", username.trim());
  if (enabled !== "") query.set("enabled", enabled);
  query.set("page", String(page));
  query.set("size", String(size));
  return `/users?${query}`;
}

export function AdminUsersPage() {
  const { client } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [notice, setNotice] = useState<string | null>(null);
  const [username, setUsername] = useState(filters.username);
  const [enabled, setEnabled] = useState(filters.enabled);

  const query = useQuery({
    queryKey: ["users", filters],
    queryFn: () => client.request<UserListDto>(usersPath(filters)),
    // Keep the current page on screen while the next one loads
    placeholderData: (previous) => previous,
  });

  /** Applies the changes to the URL; page goes back to 0 unless it is one of them. */
  const update = (changes: Record<string, string | null>) => {
    setNotice(null);
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (!("page" in changes)) next.delete("page");
      for (const [name, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(name);
        else next.set(name, value);
      }
      return next;
    });
  };

  const failure = query.error;
  useEffect(() => {
    if (isInvalidPage(failure)) {
      // A hand-edited URL; start again at the first page with the default size
      setNotice("That page does not exist, so the first page is shown.");
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("page");
          next.delete("size");
          return next;
        },
        { replace: true },
      );
      return;
    }
    if (failure && !isForbidden(failure)) toast.showError(`Could not load users. ${errorMessage(failure)}`);
  }, [failure, toast, setParams]);

  if (isForbidden(failure)) {
    return (
      <section aria-labelledby="users-heading">
        <PageHeading id="users-heading">Users</PageHeading>
        <p role="alert">{NO_ADMIN_ACCESS}</p>
      </section>
    );
  }

  const data = query.data;
  return (
    <section aria-labelledby="users-heading">
      <PageHeading id="users-heading">Users</PageHeading>
      <form
        aria-label="Filter users"
        onSubmit={(event) => {
          event.preventDefault();
          update({ username: username.trim(), enabled });
        }}
      >
        <label htmlFor="filter-username">Username</label>
        <input id="filter-username" value={username} onChange={(event) => setUsername(event.target.value)} />{" "}
        <label htmlFor="filter-enabled">Status</label>
        <select id="filter-enabled" value={enabled} onChange={(event) => setEnabled(event.target.value)}>
          <option value="">All</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>{" "}
        <Button type="submit" variant="primary">Search</Button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {query.isPending && <Skeleton label="Loading users..." />}
      {query.isError && !isInvalidPage(failure) && (
        <p>
          Users could not be loaded.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      {data &&
        (data.total === 0 ? (
          <p>No users match.</p>
        ) : (
          <>
            <TableScroll label="Users table">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="user-cell">
                        <Avatar name={u.username} id={u.id} />
                        <Link to={`/admin/users/${encodeURIComponent(u.id)}`}>{u.username}</Link>
                      </span>
                    </td>
                    <td>
                      <RoleChip role={u.role} />
                    </td>
                    <td>
                      <StatusChip enabled={u.enabled} />
                    </td>
                    <td>{formatDay(u.createdAt.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
            <p>
              {data.total} user{data.total === 1 ? "" : "s"}
            </p>
          </>
        ))}
      <Pagination
        page={filters.page}
        totalPages={data?.totalPages ?? 0}
        size={filters.size}
        defaultSize={DEFAULT_USER_PAGE_SIZE}
        disabled={!data}
        onPage={(page) => update({ page: String(page) })}
        onSize={(size) => update({ size: String(size) })}
      />
    </section>
  );
}
