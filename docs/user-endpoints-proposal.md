# User Endpoints Proposal

2026-10-13

## Context

The app can already tell users apart, but it has no way to create or manage them. This proposal adds that, and starts using the `role` field.

- **One user, seeded at startup.** `AdminBootstrapService` creates a single `ADMIN` user from `ADMIN_USERNAME` / `ADMIN_PASSWORD`. No endpoint creates, lists, or edits users.
- **Roles exist but do nothing.** `Role` has `USER` and `ADMIN`, and `CustomUserDetails` grants `ROLE_<role>`. But `SecurityConfig` only distinguishes public paths from `anyRequest().authenticated()`. There is no `@EnableMethodSecurity`, no role matcher, and no `@PreAuthorize`.
- **The data layer is ready.** Expenses are scoped by `owner_id` (V9, `users.unique_id`). Sessions, refresh rotation, and disabled-user checks already work per user.
- **Gap.** A second user can only be added by hand-editing the database, so ownership scoping has never been exercised by a real second account.

## Goals and non-goals

The goal is for real people to get their own accounts and see only their own expenses, with the admin keeping control.

**Goals**

- Let a person sign up and manage their own password.
- Let an admin list, disable, and re-role users.
- Make `ADMIN` and `USER` mean something in the security config.

**Non-goals (for now)**

- Email verification, password reset by email, OAuth/SSO. These need a mail service and are a separate piece of work.
- Per-resource permissions beyond the two roles.
- Admin access to other users' expenses. Ownership scoping stays strict.

## Proposed endpoints

Six endpoints in three groups: public sign-up, self-service under `/users/me`, and admin management under `/users`.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `POST /auth/register` | Public | Create a `USER` account. Body: `username`, `password`. Returns 201 with the user (no tokens; the client then logs in). |
| `GET /users/me` | Any user | Own profile: `id` (the `unique_id`), `username`, `role`, `createdAt`. |
| `POST /users/me/password` | Any user | Change password. Body: `currentPassword`, `newPassword`. Revokes all other sessions. |
| `GET /users` | `ADMIN` | Paged list, optional `?username=` and `?enabled=` filters. |
| `GET /users/{id}` | `ADMIN` | One user by `unique_id`. |
| `PATCH /users/{id}` | `ADMIN` | Change `enabled` and `role`. Disabling revokes that user's sessions. |

Notes on the shape:

- Public identifiers are always `unique_id` (UUID), never the numeric `id`. This matches the JWT and `expense.owner_id`.
- Responses never include `password`. Use a `UserResponse` record, like the existing expense DTOs.
- No `DELETE /users/{id}` at first. Expenses reference users by foreign key, so "disable" is the safe removal. Hard delete can come later with an explicit rule for the user's expenses.
- Sign-up is open, since this is a demo and will not be deployed publicly. Usernames are fixed once created, so there is no profile update endpoint.

## Roles and authorization

Enforce roles in the URL rules, in one place, and keep method security as a second layer.

1. Add `/auth/register` to the `permitAll()` list in `SecurityConfig`.
2. Add `.requestMatchers("/users/me", "/users/me/**").authenticated()` and `.requestMatchers("/users", "/users/**").hasRole("ADMIN")` before `anyRequest()`. Order matters: `/users/me` must match first.
3. Add `@EnableMethodSecurity` and `@PreAuthorize("hasRole('ADMIN')")` on the admin controller methods, so a future URL change cannot silently open them.
4. Confirm the JWT filter builds its authorities from the token's `role` claim (`JWTPrincipal.role`). If it does not yet set `ROLE_<role>`, fix that first; otherwise `hasRole` will deny everyone. (Not yet verified.)

The existing access-denied handler returns a plain 403 via `sendError`, not JSON. Consider routing it through `ErrorResponse` so 403 matches the other error bodies, as was done for 404.

**Role changes and live tokens.** The role is baked into the access token, so a demoted admin keeps admin rights until the token expires. Either accept that (short access-token lifetime) or have the filter re-check `enabled` and `role` per request. Decision: accept it, and revoke the user's sessions on demotion so the next refresh yields the new role.

**Guard rails.** An admin cannot disable or demote themselves, and the last enabled admin cannot be removed. Throw `BusinessRuleException` for both.

## Data model and migrations

The `users` table already fits; only small additions are needed, each as a new Flyway migration (never edit V5).

| Change | Why | Migration |
| --- | --- | --- |
| Case-insensitive unique username | `Alice` and `alice` must not both exist. Add a unique index on `lower(username)`, or normalize to lowercase on write. | V10 |
| `last_modified` set on every update | The column exists but nothing fills it. Use `@PreUpdate` or set it in the service. | none |
| `password_changed_at` (nullable timestamp) | Lets the filter or refresh reject sessions started before a password change. | V10 |
| Fix `users.id` type drift | Entity uses `Long` with `IDENTITY`; table uses `SERIAL` (int). Harmless now, but worth aligning. | optional |

User creation should live in a new `UserService` (`user/` package). `AdminBootstrapService` should call it instead of building a `User` by hand, so there is one place that sets `uniqueId`, `createdAt`, `enabled`, and the password hash.

## Expenses and sessions

Expenses need no schema change: new users get their own `unique_id`, and the V9 scoping already returns 404 for other owners' rows.

- **Add a cross-user test.** Register two users, create an expense as the first, and assert the second gets 404 on read, update, and delete. This is the first real proof of the isolation work.
- **Revoke sessions on sensitive changes.** Disable, demote, and password change should end the user's `UserSession` rows. `UserSessionService` has `revokeSession(refreshToken)`; add a `revokeAllForUser(userId)` beside it.
- **Admin sees users, not their expenses.** `GET /users` returns account data only. If an admin needs spend reports later, add a separate aggregate endpoint rather than loosening ownership.
- **Existing admin keeps its expenses.** V9 already assigned old expenses to the admin, so nothing migrates.

## Security and decisions

Public registration widens the attack surface, and the login brute-force item in `docs/TODO.md` (Needs you) becomes more urgent once it exists.

**Security**

- Password rules: minimum length (suggest 12), maximum 72 bytes (BCrypt truncates beyond that), reject the username as the password. Reuse the same validation on register and change-password.
- Registration must not reveal whether a username exists beyond the 409 it needs. Accept that for usernames, since there is no email.
- Rate-limit `/auth/register` and `/auth/login` together. The pending decision on throttling should be made before registration ships.
- Never log passwords or tokens. Hash with the existing `PasswordEncoder`.
- An attacker who registers many accounts can fill the table. Throttling covers this at small scale; a CAPTCHA or invite code covers it at larger scale.

**Decisions made**

- [x] **Open sign-up.** This is a demo and won't be deployed publicly, so `POST /auth/register` stays public.
- [x] **Usernames are fixed once created.** No username change endpoint.
- [x] **No `email` field for now.** Add it with password reset later.
- [x] **Keep the `Role` enum** (`USER`, `ADMIN`).
- [x] **Demotion takes effect at the next refresh.** Revoke the user's sessions on demotion.

## Implementation order

Ship in four commits, each with tests, following the repo rule of one fix per commit on a branch.

1. **`UserService` + role enforcement.** Extract user creation, enable `@EnableMethodSecurity`, add the `/users/**` matchers, and verify the JWT filter grants `ROLE_<role>`. Test: a `USER` token gets 403 on an admin path; an `ADMIN` token passes.
2. **`POST /auth/register`.** Validation, 409 on duplicate (case-insensitive), V10 migration. Test: success, duplicate, weak password, then login with the new account.
3. **`/users/me` endpoints.** Profile and change password with session revocation. Test: wrong current password, old refresh token rejected after a change.
4. **Admin endpoints.** List, get, patch `enabled`/`role`, plus `revokeAllForUser` and the self-demotion and last-admin rules. Test: each guard rail, and the cross-user expense isolation test from above.

Afterwards: update `README.md` (auth design), add Bruno requests for each endpoint, and record the work in `docs/TODO.md`.
