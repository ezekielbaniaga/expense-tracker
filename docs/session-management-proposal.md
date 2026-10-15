# Session Management API Proposal

2026-10-16

Status: done

## Context

Sessions already exist in the database, but a user can't see them and can only end the one they hold the refresh token for. This proposal lets users and admins see and revoke sessions. It covers the three open roadmap items in `README.md`: "Revoke individual sessions", "Revoke all sessions", and "Session management API".

- **Sessions are stored.** Every login creates a `user_sessions` row (V7) with `created_at`, `last_used_at`, `expires_at`, `revoked_at`, `user_agent`, and `ip_address`. Refresh rotation, reuse detection, and nightly cleanup already work.
- **Revocation exists, but only inside the code.** `UserSessionService.revokeSession(refreshToken)` backs `POST /auth/logout`. `revokeAllForUser(userId)` runs on password change, disable, and demotion. No endpoint calls either one for a chosen session.
- **The access token doesn't say which session it belongs to.** `JWTService.generateToken` writes `sub`, `uid`, and `role`. Nothing links the token to a `user_sessions` row, so the server can't mark a session as "this device" or skip it when revoking the others.
- **The JWT filter has no database id.** It builds `CustomUserDetails` from the token with `databaseId = null` (`CustomUserDetailsMapper`). The token's `uid` is `users.unique_id`, so self-service endpoints must look the user up by it before running any `user_id` query.
- **Session ids are internal.** `user_sessions.id` is a `BIGSERIAL`. Everything else public uses a UUID (`users.unique_id`). A sequential id in a URL would show how many logins the app has had.
- **No index on `user_sessions.user_id`.** `revokeAllForUser` scans the table today. Listing a user's sessions would scan it too.

## Goals and non-goals

The goal is for a user to see where they are logged in and log out a lost or unknown device, without needing that device's refresh token.

**Goals**

- List your own active sessions, with the current one marked.
- Revoke one of your sessions, or all of them except the current one.
- Let an admin list and revoke any user's sessions.

**Non-goals (for now)**

- Ending access tokens right away. A revoked session's access token stays valid until it expires (15 minutes, `app.jwt.expiration`), as with logout today. See [Revocation and live access tokens](#revocation-and-live-access-tokens).
- Session history. Only active sessions are listed. Revoked and expired rows are deleted by the nightly cleanup after 7 days anyway.
- Device names, geo-IP lookup, or "new login" notifications.

## Proposed endpoints

Six endpoints: three self-service ones under `/users/me/sessions` and three admin ones under `/users/{id}/sessions`.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `GET /users/me/sessions` | Any user | Your active sessions, most recently used first. One of them has `current: true`. |
| `DELETE /users/me/sessions/{sessionId}` | Any user | Revoke one of your sessions. 204. 404 `SESSION_NOT_FOUND` if it isn't yours. |
| `DELETE /users/me/sessions` | Any user | Revoke all your sessions except the current one. 200 with `{"revoked": n}`. |
| `GET /users/{id}/sessions` | `ADMIN` | That user's active sessions. |
| `DELETE /users/{id}/sessions/{sessionId}` | `ADMIN` | Revoke one session of that user. |
| `DELETE /users/{id}/sessions` | `ADMIN` | Revoke all of that user's sessions (calls `revokeAllForUser`). 200 with `{"revoked": n}`. |

Response body for one session (`SessionResponse` record):

```json
{
  "id": "6f1c2d9e-2a4b-4c3e-9f0a-7b8c9d0e1f2a",
  "createdAt": "2026-10-16T08:12:44",
  "lastUsedAt": "2026-10-16T09:40:02",
  "expiresAt": "2026-11-15T08:12:44",
  "userAgent": "bruno-runtime/2.3.0",
  "ipAddress": "172.18.0.1",
  "current": true
}
```

Notes on the shape:

- `id` is the new `user_sessions.unique_id` (UUID), never the numeric `id`. This matches users and expenses.
- The response never includes the refresh token hash.
- "Active" means `revoked_at IS NULL AND expires_at > now()`. Revoked and expired sessions are left out.
- No paging. Active sessions are capped at 10 per user (see [Decisions](#decisions)).
- `DELETE` on a session that is yours but already revoked or expired returns 204, so repeating the call is safe. `revoke` already keeps the first `revoked_at`.
- Revoking your current session through `DELETE /users/me/sessions/{sessionId}` is allowed. It works like `POST /auth/logout`, but uses the access token instead of the refresh token.
- To log out everywhere including here, call `DELETE /users/me/sessions` and then `POST /auth/logout`. One endpoint that does both would be possible, but two calls keep each one simple.
- Admin `DELETE /users/{id}/sessions` doesn't return 409 `CANNOT_MODIFY_SELF` when the admin targets themselves. Logging yourself out is harmless.

**Routing.** `SecurityConfig` needs no change. `/users/me/sessions` matches the existing `/users/me/**` (authenticated) rule, and `/users/{id}/sessions` matches `/users/**` (`ADMIN`). On the controller side, the literal `/users/me/sessions` in `UserController` is more specific than `/users/{id}/sessions` in `AdminUserController`, so Spring picks the right one. A test should confirm this, since `me` must never be parsed as a UUID.

## Knowing the current session

A new `sid` claim in the access token holds the session's `unique_id`. The filter reads it into `JWTPrincipal`, still without touching the database.

1. **V14** adds `user_sessions.unique_id UUID NOT NULL UNIQUE`, filled with `gen_random_uuid()` for existing rows (built into Postgres 13+; the image is 18.3).
2. `createSession` returns the raw refresh token and the session's `unique_id`, for example as a `CreatedSession` record. `AuthController.login` must call `createSession` before `generateToken` (today it's the other way round) and pass the id to a new `generateToken(userDetails, sessionId)` overload. The 1-arg overload stays and writes no `sid`.
3. `rotateRefreshToken` adds the session's `unique_id` to `RefreshTokenResult`, so the token from `/auth/refresh` keeps the same `sid`. The `unique_id` never changes when the refresh token rotates.
4. `JWTPrincipal` gets a nullable `UUID sessionId`, and `CustomUserDetails` exposes it to controllers through `@AuthenticationPrincipal`.

**Tokens without `sid`.** Tokens issued before the deploy have no `sid` for up to 15 minutes. With such a token, `GET` marks no session as current, and `DELETE /users/me/sessions` revokes every session, since it can't tell which one to keep. Nothing else breaks.

**Is `sid` safe in the token?** Yes. It's a random v4 UUID (`UUID.randomUUID()`, not the project's `DefaultUUIDGenerator`, whose v7 UUIDs embed the creation time), so it has no meaning on its own. It reveals nothing beyond what `GET /users/me/sessions` already shows the same caller. Revoking a session needs a valid access token for the same user anyway.

## Data model and migrations

One migration, V14. Never edit V7 or V10.

```sql
ALTER TABLE user_sessions ADD COLUMN unique_id UUID;
UPDATE user_sessions SET unique_id = gen_random_uuid();
ALTER TABLE user_sessions ALTER COLUMN unique_id SET NOT NULL;

CREATE UNIQUE INDEX idx_user_sessions_unique_id
    ON user_sessions(unique_id);

-- Listing and revokeAllForUser both filter on user_id
CREATE INDEX idx_user_sessions_user_id
    ON user_sessions(user_id);
```

- `UserSession` gets `@Column(name = "unique_id", nullable = false, updatable = false, unique = true) private UUID uniqueId`, set in `createSession`.
- `UserSessionRepository` gets:
  - `findActiveByUserId(userId, now)`, ordered by `last_used_at DESC`
  - `findByUniqueIdAndUserId(uniqueId, userId)`. The owner check is part of the query, so another user's session is simply "not found".
  - `revokeAllForUserExcept(userId, keepUniqueId, revokedAt)`, modeled on `revokeAllForUser`.
- A plain index on `user_id`, not a partial one. It also covers the `ON DELETE CASCADE` from `users`, and Postgres can still filter `revoked_at` from the matching rows.

## Revocation and live access tokens

This is the main limit of the design, so the API docs must say it plainly. Revoking a session stops its **refresh token** at once. Its **access token** keeps working until it expires, at most 15 minutes later. The same is true of logout, password change, and disable today, and README section 17 already says so.

Options if that window is too long:

| Option | Cost |
| --- | --- |
| Accept it (recommended) | None. Matches the "no DB lookup per request" design in the README. |
| Shorter `app.jwt.expiration` (e.g. 5m) | More `/auth/refresh` calls. One config change. |
| Filter checks `sid` against the database on each request | One indexed lookup per request, which gives up a stated design goal. |
| In-memory set of recently revoked `sid`s, kept for one token lifetime | Fast, but per instance and lost on restart. Breaks with more than one instance. |

`sid` is what makes the last two options possible later, so adding it now keeps them open.

## Security

- **Ownership in the query.** Every self-service lookup filters by the caller's user, resolved from the token's `uid`, never from the request. Another user's session id gives 404, the same as an id that doesn't exist, so session ids can't be probed. This follows the expense rule (`ExpenseRepository.findByUniqueIdAndOwnerId`).
- **Admin caller check.** Admin endpoints call `userService.requireEnabledAdmin(admin.getUniqueId())` first, like `list` and `get` in `AdminUserController`. A demoted admin's old token can't be used to read or revoke sessions.
- **No password needed to revoke.** Revoking only removes access. Someone holding a stolen access token could log the real user out elsewhere. That's annoying, but it also cuts off the thief's own refresh token if the thief logged in separately.
- **Listing shows IP and User-Agent.** That's fine for the owner. Admins see it too, and in a real deployment that would need a privacy note. `ip_address` comes from `getRemoteAddr()`, so behind a reverse proxy every session shows the proxy's IP. Fixing that needs `server.forward-headers-strategy` and a trusted proxy, which belongs with the deploy decision in `docs/TODO.md`.
- **Logs.** Log session revocations at INFO with the session `unique_id` and the actor. Never log tokens.

## Decisions

Decided on 2026-10-16:

- [x] **Cap active sessions at 10 per user.** Login revokes the least recently used session past the cap, under a lock on the user row. The lists need no paging.
- [x] **No `revoke_reason` column.** Revoked sessions aren't listed, so the API doesn't need it.
- [x] **Accept the 15-minute access-token window.** Document it plainly.
- [x] **Name the column `unique_id`**, like `users` and `expense`.
- [x] **Random v4 UUIDs** for session ids (`UUID.randomUUID()`), matching the `gen_random_uuid()` backfill.
- [x] **`createSession` returns a `CreatedSession` record** (raw refresh token and session id). Tests are updated to match.
- [x] **Admin endpoints return 404** for an unknown user (`USER_NOT_FOUND`) and for a session that doesn't belong to `{id}` (`SESSION_NOT_FOUND`).
- [x] **`current` in the admin list** marks only the admin's own session.

## Implementation order

Queued as ten one-commit items under "Session Management API" in `docs/TODO.md`, in this order: V14 migration, `sid` claim, session id through login and refresh, list own sessions, revoke one, revoke others, admin list, admin revoke, session cap, docs (README and Bruno).
