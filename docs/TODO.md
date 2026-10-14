# TODO

Last investigation: 2026-10-13 17:01 — 9 new findings

Findings from the project review on 2026-10-12, plus later investigations. Paths are relative to
`spring-boot-maven-sample/backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

Work items top to bottom, one per commit. When an item is fixed, move it to **Done** with its
commit hash. Items that need a human decision or action outside the code go in **Needs you**.

## Users

From `docs/user-endpoints-proposal.md` (read it for the full design). Migration numbers there are stale:
V10 is taken by the session cleanup indexes, so the first new migration is V11.

- [ ] **Add `GET /users/me` and `POST /users/me/password`.** New `user/UserController.java`. The access token's
      principal has no database id, so look the user up by `unique_id` (add `UserRepository.findByUniqueId`).
      Password change takes `currentPassword` + `newPassword`, applies the register password rules, sets
      `last_modified` (nothing fills it today), and revokes all the user's sessions via a new
      `UserSessionService.revokeAllForUser(userId)` (bulk `UPDATE ... WHERE user_id = :id AND revoked_at IS
      NULL`). Wrong current password gives 400 or 409, not 401, so clients don't treat it as a logout. Test:
      profile, wrong current password, old refresh token rejected after a change, login with the new password.
- [ ] **Add admin endpoints `GET /users`, `GET /users/{id}`, `PATCH /users/{id}`.** `@PreAuthorize("hasRole('ADMIN')")`
      on each method as a second layer behind the URL rule. List is paged with optional `?username=` and
      `?enabled=` filters; `{id}` is the `unique_id`. PATCH changes `enabled` and `role` (needs `version`
      like expenses), sets `last_modified`, and calls `revokeAllForUser` on disable or demotion so the next
      refresh carries the new state. Guard rails as `BusinessRuleException`: an admin can't disable or
      demote themselves, and the last enabled admin can't be removed (count admins in the same transaction
      with a lock, or two admins demoting each other at once both pass). Test: USER gets 403, each guard
      rail, demoted user's refresh token is rejected.
- [ ] **Document the user endpoints.** Update `README.md` (registration, roles, what revokes sessions, that
      a role change applies at the next refresh) and add Bruno requests for the six endpoints to
      `spring-boot-maven-sample/spring-boot-sample-bruno-opencollection.yml`.
- [ ] **`users.id` is `SERIAL` (int) but the entity uses `Long`.** Low priority. Align with a migration that
      changes `users.id` and `user_sessions.user_id` to `BIGINT` together, or leave as is and note why.

## Needs you

- [ ] Old secrets from `docker_compose/.env` remain in git history. Rotate them before any real deployment.
- [ ] **Decide on login brute-force protection.** `/auth/login` allows unlimited password attempts. Options:
      per-username/IP throttling in the app (in-memory, so per instance), a library like Bucket4j, or rate
      limiting at a reverse proxy. Which one depends on how you'll deploy. The user endpoints proposal says to
      decide this before `POST /auth/register` ships, since the same limit should cover both (and stop mass
      account creation). The register item is in the queue above.
- [ ] **Decide whether to add `users.password_changed_at`.** The proposal lists it so old sessions can be
      rejected after a password change. But the password change item already revokes every session, and the
      JWT filter never reads the database, so the column would only help if you also add a per-request user
      check. Suggest dropping it unless you want that check.

## Done

- [x] Compose passed `ADMIN_USER` but the app reads `ADMIN_USERNAME` (683ec2f)
- [x] `logging` was nested under `spring` in `application.yml`, so it was ignored (ef0a319)
- [x] `.env` with secrets was tracked; replaced with `.env.example` (3a188fd)
- [x] Context test needed a live local Postgres; now uses Testcontainers (8111665)
- [x] Refresh token reuse now revokes the whole session (5b27672)
- [x] Concurrent refreshes with the same token are serialized by a row lock; losers count as reuse (09c4ed0)
- [x] Refresh rotation returns `CustomUserDetails` mapped inside the transaction, not a lazy `User` (81eaf15)
- [x] Disabled users can no longer refresh; their session is revoked (f74c6aa)
- [x] `POST /auth/logout` revokes the session of the given refresh token (22d3bc2)
- [x] Expenses are scoped to their owner; other users' expenses return 404 (7a70240)
- [x] Expense delete is transactional, checks `?version=`, and rejects archived expenses (4e9e344)
- [x] `spring-boot-starter-flyway-test` is test-scoped; 26 test jars no longer ship in the production jar (58d7ead)
- [x] JWT filter parses each token once and the signing key is cached (b2c8648)
- [x] Error responses keep their real status (400/500) instead of turning into 401 (08409d5)
- [x] Expense amount and date are required; v1.1 total skips legacy rows without amount (b2084ff)
- [x] Expense amount is validated against `NUMERIC(10,2)`; overflow and extra decimals give 400 (cd83e05)
- [x] 404 responses are `ErrorResponse` JSON like every other error (199601c)
- [x] `X-API-Version` accepts `v`/`V` prefixes (`v1.0`, `V1.1`, `v1`) (2557e9a)
- [x] Nightly job deletes sessions ended over 7 days ago, with their used token hashes (610162f)
- [x] Startup rejects a `JWT_SECRET` shorter than 32 bytes instead of failing every login (65e4816)
- [x] Docker Compose starts the app only after Postgres passes a `pg_isready` healthcheck (78d0beb)
- [x] App container runs as an unprivileged `app` user instead of root (8a401f1)
- [x] `/auth/login` is covered by tests: success, wrong password, unknown and disabled user, blank input (83182ea)
- [x] Login truncates a User-Agent over 500 characters instead of failing with 500 (077aedb)
- [x] PUT/PATCH without `version` returned 409 instead of 400; `version` is now `@NotNull` (758dbb9)
- [x] GET /api/expense/{id} returns 404 for deleted (archived) expenses (733c734)
- [x] POST and /categories now accept X-API-Version 1.1 (baseline `1.0+`); only 1.0 and 1.1 are supported (a9661dc)
- [x] Startup rejects an `ADMIN_PASSWORD` over 72 bytes (UTF-8) with a clear error instead of a BCrypt crash (1c50f0e)
- [x] An empty `ADMIN_USERNAME` now falls back to `admin` in Compose and in `AdminBootstrapService` (75ef8ea)
- [x] README described reuse detection as future work and listed files that don't exist (e937c41)
- [x] Tests cover PUT/PATCH expense success, stale-version and archived 409s, and refreshing an expired or revoked session (659f519)
- [x] Session cleanup uses indexes on `expires_at` and `revoked_at` (V10) instead of scanning `user_sessions` (ed065cd)
- [x] `UserService` creates users (bootstrap uses it); `/users/**` requires ADMIN, `/users/me` any user (1fc86a8)
- [x] Spring Security 401/403 responses are `ErrorResponse` JSON (`AUTHENTICATION_REQUIRED` / `ACCESS_DENIED`) instead of the default error page (ab2ae02)
- [x] `POST /auth/register` creates a USER (201 `UserResponse`); usernames unique ignoring case (V11), login matches any case, password rules in `PasswordValidator` (2c312df)
- [x] Test cross-user expense isolation end to end via register/login; no ownership bug found (b3d664e)
