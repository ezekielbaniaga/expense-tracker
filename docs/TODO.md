# TODO

Last investigation: 2026-10-15 00:51 — 7 new findings

Findings from the project review on 2026-10-12, plus later investigations. Paths are relative to
`spring-boot-maven-sample/backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

Work items top to bottom, one per commit. When an item is fixed, move it to **Done** with its
commit hash. Items that need a human decision or action outside the code go in **Needs you**.

## Errors and validation

- [ ] **400s raised by Spring MVC are not `ErrorResponse`.** `common/GlobalExceptionHandler.java` has no
      handler for `MethodArgumentTypeMismatchException`, `HttpMessageNotReadableException` or
      `MissingServletRequestParameterException`, so a malformed UUID (`GET /users/not-a-uuid`), an unknown
      enum (`PATCH /users/{id}` with `"role":"SUPER"`), `?page=abc`, malformed JSON or a missing `?version=`
      return Spring Boot's `{timestamp, status, error, path}` body instead. Verified against a real server
      for the UUID, enum and `page` cases.
      README section 17 promises the same body for every error.

## Database

- [ ] **`expense.id` is still `SERIAL` (32-bit).** `V1__initial_tables.sql` created it as `SERIAL`, while
      `expense/entity/Expense.java` maps it as `Long`. V12 widened `users.id` for the same mismatch, and
      expenses grow much faster than users. Add a migration that widens `expense.id` and `expense_id_seq` to
      `BIGINT` (no foreign key points at it).

## Docs

- [ ] **README describes the wrong error body.** README section 17 says errors are
      `{"code": "...", "message": ...}`, but `common/ErrorResponse.java` returns `messages` (an array) and a
      `timestamp` (verified in responses). Fix the README line.
- [ ] **`AdminUserController` Javadoc misstates when a role change applies.** `user/AdminUserController.java`
      says on `update` that a role change applies at the user's next login. A promotion revokes nothing and
      applies at the next `/auth/refresh` (which reads the role from the database); only demotion and
      disabling revoke sessions and force a login. README section 17 already describes it correctly.

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
- [x] `GET /users/me` and `POST /users/me/password`; a change checks the current password (400 if wrong), applies `PasswordValidator`, sets `last_modified` and revokes all sessions via `revokeAllForUser` (2af110b)
- [x] Admin `GET /users` (paged, `?username=`/`?enabled=`), `GET /users/{id}`, `PATCH /users/{id}` (enabled/role with `version`); disable/demote revokes sessions; 409 `CANNOT_MODIFY_SELF` / `LAST_ADMIN` with enabled admins locked `FOR UPDATE`; `@PreAuthorize` 403 is `ErrorResponse` via `GlobalExceptionHandler` (2b9614a)
- [x] User endpoints documented: README section 17 (registration, roles, session revocation, role change at next refresh) and six Bruno requests (03d7921)
- [x] `users.id` and `user_sessions.user_id` are `BIGINT` (V12), matching `User.id` as `Long`; the id sequence is `BIGINT` too (651143e)
- [x] Demoted or disabled admins could use their old token to reinstate themselves; admin endpoints now check the caller in the database (1104109)
- [x] Register strips usernames and allows only `[A-Za-z0-9._-]` (400 `INVALID_USERNAME`); login strips too but tries the exact name first, so existing accounts still log in (be932ae)
- [x] Admin bootstrap logs a WARN when `ADMIN_USERNAME` belongs to a non-admin or disabled account, instead of silently skipping; the account is not promoted or re-enabled (6d1caff)
