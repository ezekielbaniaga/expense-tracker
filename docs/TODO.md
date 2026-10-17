# TODO

Last investigation: 2026-10-16 20:21 — 8 new findings

Findings from the project review on 2026-10-12, plus later investigations. Paths are relative to
`backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

Work items top to bottom, one per commit. When an item is fixed, move it to **Done** with its
commit hash. Items that need a human decision or action outside the code go in **Needs you**.

## Web UI

From docs/web-ui-proposal.md. Work in order. Java paths are relative to the package root as above;
`frontend/` and `docker_compose/` paths are from the repo root. Frontend items run from `frontend/` and
need Node 24 (installed 2026-10-18): `npm ci`, `npm test` (Vitest) and `npm run build` must pass before commit.

- [ ] **E2E stack and Playwright suite (local).** `docker_compose/docker-compose.e2e.yml`: its own project name
      and volume, a known test `ADMIN_PASSWORD` (12+ characters, not `change-me`) and `JWT_SECRET`, normal
      profile (the `test` profile creates no admin), `APP_JWT_EXPIRATION=20s` and raised `APP_RATE_LIMIT_*`.
      `frontend/e2e/*.spec.ts` with `@playwright/test`: login and logout, two tabs refreshing together stay
      signed in, reuse lands on `/login`, edit conflict across two pages, cross-user 404 via two registered
      users. `frontend/run_e2e.sh` starts the stack, runs Playwright, and stops the stack. No CI.
      Test: `npx playwright test --list` lists the specs. The real run is manual (see Needs you).
      Proposal: Testing.
- [ ] **Register page.** `/register` uses `POST /auth/register` (201, no tokens), then logs in. Map
      `USERNAME_TAKEN` (409), `INVALID_USERNAME`, `INVALID_PASSWORD` and 429 (10 per hour per IP).
      Test: MSW for each code. Proposal: Pages and screens.
- [ ] **Profile, change password and sessions.** `/me` uses `GET /users/me`; password change via
      `POST /users/me/password` (400 `INVALID_CURRENT_PASSWORD`, 429 after 5 wrong; success ends every session,
      so clear and go to `/login`). A "Your devices" list via `GET /users/me/sessions` marks `current`, with
      revoke one (`DELETE /users/me/sessions/{sessionId}`) and revoke others (`DELETE /users/me/sessions`).
      Test: MSW for each path. Proposal: Pages and screens.
- [ ] **Admin users screen.** `/admin/users`, linked only when `role` is `ADMIN`: `GET /users?page&size&username&enabled`,
      `GET /users/{id}`, `PATCH /users/{id}` (`enabled`, `role`, `version`). Show `CANNOT_MODIFY_SELF`,
      `LAST_ADMIN`, `CONCURRENT_MODIFICATION`, `EMPTY_PATCH`, `INVALID_PAGE`, and 403 for a demoted admin.
      Test: MSW for each code. Proposal: Pages and screens.
- [ ] **Accessibility and responsive pass.** Labels on every input, focus moved to the heading after navigation
      and to the first error after a failed submit, keyboard-only flows, a narrow-screen layout.
      Test: Testing Library role queries plus `vitest-axe` on each screen. The visual check is manual (see
      Needs you). Proposal: Milestones (7).
- [ ] **Docs for the web UI.** `README.md`: a web UI section (same-origin proxy, refresh cookie and Origin
      check, cross-tab refresh, list 1.2) and a Roadmap entry. `CLAUDE.md`: `frontend/` in Layout, Node 24 and
      the npm commands in Build and test. `docker_compose/README.md`: the `web` service, port 8081, app port
      on 127.0.0.1, `TRUSTED_PROXIES`, the e2e stack. Mark the proposal done. Test: every path and command
      named exists. Proposal: Milestones.

## Needs you

- [ ] **Manual checks once the Web UI items are done.** (1) Compose: update `TRUSTED_PROXIES` in your
      `docker_compose/.env`, log in through `:8081` and check that `user_sessions.ip_address` holds your client
      IP, not nginx's. (2) Run `frontend/run_e2e.sh` (needs `npx playwright install`). (3) Click through every
      screen with the keyboard only and on a narrow window.

## Done

- [x] Node 24 LTS (v24.22.0) installed for the Web UI frontend items; Node 20.15.1 was too old for Vite 7
- [x] Cleaned up the untracked files in the repo root
- [x] Rotated the `POSTGRES_PASSWORD`, `ADMIN_PASSWORD` and `JWT_SECRET` that were committed to history (2026-10-17): new random values in the git-ignored `docker_compose/.env`. The old values still sit in public history and are dead only where nothing uses them; the Compose database volume `spring-boot-sample_pgdata`, created with them, was deleted, and any other deployment needs the same rotation
- [x] Login lockout abuse: the strict failure bucket (5 per 15 minutes) is keyed by username and client IP, so a guesser locks out only their own address; a loose any-IP bucket (100 per hour) is the backstop, and one IP can keep about 12 accounts locked instead of 60; success refunds both (f9ad763)
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
- [x] 400s raised by Spring MVC now return ErrorResponse (60b83d5)
- [x] `expense.id` and `expense_id_seq` are `BIGINT` (V13), matching `Expense.id` as `Long` (dd839a9)
- [x] README section 17 already documents the `{"code", "messages", "timestamp"}` error body; verified against `ErrorResponse` (60b83d5)
- [x] `AdminUserController` Javadoc now says a promotion applies at the next `/auth/refresh`, only demotion/disabling force a login (840e145)
- [x] `user_sessions.unique_id` (random v4 UUID, NOT NULL, unique index) and a `user_id` index (V14); `createSession` sets it (fbb9c10)
- [x] Access token carries an optional `sid` claim (`JWTPrincipal`/`CustomUserDetails.sessionId`); missing `sid` parses to null, non-UUID is rejected (7f92648)
- [x] Login and refresh put the session's `unique_id` in the access token `sid`; `createSession` returns `CreatedSession`, `RefreshTokenResult` has `sessionId` (2c4a927)
- [x] `GET /users/me/sessions` lists active sessions (most recently used first) as `SessionResponse`; the token's `sid` session is `current`, none for tokens without `sid` (0e5fbb1)
- [x] `DELETE /users/me/sessions/{sessionId}` revokes one of your sessions (204, also if already revoked); another user's or unknown id is 404 `SESSION_NOT_FOUND` (bc7bfdf)
- [x] `DELETE /users/me/sessions` revokes all your other sessions and returns `{"revoked": n}`; a token without `sid` revokes all (6b65014)
- [x] Admin `GET /users/{id}/sessions` lists a user's active sessions; `current` marks only the admin's own session, unknown user is 404 `USER_NOT_FOUND`, demoted admins get 403 (ccf729b)
- [x] Admin `DELETE /users/{id}/sessions/{sessionId}` (204; not the user's session is 404 `SESSION_NOT_FOUND`) and `DELETE /users/{id}/sessions` (`{"revoked": n}`, unknown user 404); demoted admins 403, admins may revoke their own (f4e8b5e)
- [x] Login caps active sessions at 10 per user, revoking the least recently used; `createSession` locks the user row so concurrent logins cannot exceed it (4488f0d)
- [x] Session management documented: README (`sid`, `unique_id`, Sessions subsection, revocation table, roadmap) and six Bruno requests; proposal marked done (d9110fc)
- [x] Login re-checks the user under its row lock: a password change or disable that commits during the password check gives 401 and no session; the access token uses the locked user's role (1b75457)
- [x] Bulk session revokes (`DELETE /users/me/sessions`, `DELETE /users/{id}/sessions`, password change, disable/demote) skip expired sessions: not counted in `revoked`, `revoked_at` stays null (1d7d652)
- [x] Decided 2026-10-16: no `users.password_changed_at`. Password change already revokes every session and the JWT filter never reads the database, so the column would add nothing
- [x] Decided 2026-10-16: refresh token reuse stays strict, no grace window. A lost refresh response ends in a new login; raw refresh tokens are never stored
- [x] `changePassword` locks the user row (`findLockedById`) and flushes before revoking, so a concurrent login can't keep a session past a password change; admin disable pinned by the same test (dc47581)
- [x] Logout with an already-rotated refresh token revokes that token's session (no reuse WARN); still always 204 (9961dce)
- [x] Rotation keeps only the newest 20 used refresh token hashes per session; older tokens get a plain 401, not reuse (13a39a6)
- [x] A rotated refresh token replayed on an already ended (logged out, revoked or expired) session is a quiet 401: no reuse WARN, no re-stamp; concurrent replays give exactly one WARN (05d0abb)
- [x] Login truncates an `ip_address` over 45 characters (e.g. IPv6 with zone id) instead of failing with 500 (030adfe)
- [x] Client IP comes from `X-Forwarded-For` via Tomcat's RemoteIpValve (`forward-headers-strategy: native`), trusted only from `TRUSTED_PROXIES` (loopback by default, empty in Compose); Compose README says to stop publishing 8080 behind a proxy (763ae30)
- [x] Rate limit `/auth/login` with Bucket4j: 5 failures per 15 minutes per normalized username, 20 attempts per minute per client IP, 429 `TOO_MANY_REQUESTS` with `Retry-After`, bounded Caffeine maps, limits in `app.rate-limit.*`, reusable `KeyedRateLimiter`/`RateLimiterFactory` (296d5ad)
- [x] Rate limit `/auth/register` (10 per hour), `/auth/refresh` and `/auth/logout` (60 per minute each) per client IP via `AuthEndpointRateLimiter`; same 429 `TOO_MANY_REQUESTS` with `Retry-After`, limits in `app.rate-limit.register|refresh|logout.client-ip` (a7eb002)
- [x] A token signed with our key but missing or blank `uid`, `role` or subject is rejected as invalid (401) instead of a `NullPointerException` and 500 (e786c91)
- [x] Access tokens are always HS256 (explicit `Jwts.SIG.HS256`, header `alg` checked) and carry a required `iss: expense-tracker`; pre-change tokens without `iss` get 401 and refresh once (8c2af61)
- [x] "Now" comes from a UTC `Clock` bean (`ClockConfig`) in `UserSessionService`, `UserService`, `ExpenseService` and the session cleanup; LocalDateTime is bound as-is (`hibernate.type.java_time_use_direct_jdbc`), `hibernate.jdbc.time_zone` left unset because it shifts LocalDateTime on a non-UTC JVM; README says API timestamps are UTC without offset; non-UTC deployments must convert existing rows (c2c7d60)
- [x] Session lifetime, active-session cap and ended-session retention are `app.session.lifetime|max-active|retention` (30d, 10, 7d) in `SessionProperties` instead of constants; README says where they are set (6004673)
- [x] Session cleanup runs once at 03:00 and deletes in batches of 1,000 (each its own transaction) until a batch is short, at most 100 batches; was 60 runs of 1,000 each (cb79386)
- [x] Pinned the accepted 15-minute access-token window after revoke and logout with tests (26d1d5b)
- [x] Removed the dead `DebugController` (71787e0)
- [x] Quieter, safer application.yml defaults: open-in-view off, Flyway at INFO, dev datasource moved to application-dev.yml (6953c86)
- [x] Public `GET /actuator/health` (only health exposed, `{"status":"UP"}` without details or groups, other actuator endpoints 401/404); image installs curl for a Dockerfile `HEALTHCHECK` and the Compose app healthcheck (584b964)
- [x] README section 14 lists the real `GlobalExceptionHandler` mappings; section 8 diagram has the reuse and disabled-user branches (16f08e3)
- [x] Dropped the duplicate `index_users_unique_id` (V15); `uq_users_unique_id` is the only index on `users.unique_id` (cd98254)
- [x] Login username (100), login password (1,000, no hint of the 72-byte rule) and refresh/logout token (128) are size-capped; oversize gives 400 `VALIDATION_ERROR` (d07587f)
- [x] Login and refresh return `accessTokenExpiresIn` (seconds, `app.jwt.expiration`) and `refreshTokenExpiresAt` (the session's `expires_at`, UTC without offset, unchanged by rotation); README section 1 and web UI proposal step 4 updated (59acf64)
- [x] `POST /users/me/password` limits wrong current passwords to 5 per 15 minutes per user (keyed by the token's unique_id, 429 with Retry-After) and caps `currentPassword` at 1,000 (2e226ed)
- [x] Startup rejects the `.env.example` placeholder `ADMIN_PASSWORD=change-me`, and a password under 12 characters when it creates the admin (bdc6aef)
- [x] Startup rejects a negative `app.session.retention` and a non-positive `app.session.lifetime` or `app.jwt.expiration`, naming the property (24cd708)
- [x] Expense date `@PastOrPresent` now validates against the UTC `Clock` offset to UTC+14 (e2c4941)
- [x] Per-IP rate limits key an IPv6 client by its /64 (`ClientIpKey`); IPv4 unchanged, zone ids dropped, IPv4-mapped counts as IPv4 (03acb80)
- [x] Native cleanup queries bind their cutoff as ISO text cast in SQL, so a JVM zone DST gap no longer shifts it by an hour (92221d0)
- [x] Expense cleanup runs once at 2AM in batches of 1,000 until short, capped at 100 (87a5f67)
- [x] Docs lagged the code: CLAUDE.md env notes, TestcontainersConfiguration Javadoc, README security tree and roadmap (0f6ec0a)
- [x] Expense list version 1.2 returns category, date and version, newest date first (807fd73)
- [x] Login with `X-Refresh-Token-Transport: cookie` sets the refresh token as an HttpOnly, Secure, SameSite=Strict cookie on /auth and leaves it out of the body (c9378fb)
- [x] Refresh and logout read the refresh cookie when the body has no token, require an allowed `Origin` (else 403 `ORIGIN_NOT_ALLOWED`), rotate or clear the cookie (d25e097)
- [x] Scaffolded `frontend/` (Vite 7.3.7, React 19, TypeScript, router, query, react-hook-form, zod, Vitest/msw, exact versions, `/api` `/auth` `/users` dev proxy without changeOrigin); `npm ci`, test, build and lint pass (c7f0275)
- [x] `frontend/src/api/errors.ts` (ApiError, `parseApiError` incl. Retry-After and non-JSON bodies, `fieldErrors`) and `expense.ts` (DTO types, `total_amount`/`supported_categories` mapping, amount and date helpers) with Vitest tests (2640d61)
- [x] `frontend/src/api/client.ts`: fetch client with the access token in memory, explicit `X-API-Version`, cookie-transport login, single-flight `POST /auth/refresh` shared by parallel 401s and the early refresh (`accessTokenExpiresIn - 60` s), one replay; refresh 401/400 or a second 401 emits signed-out, 429 (with `retryAfter`) and network errors keep the session; Vitest + MSW tests (7723832)
- [x] `frontend/src/api/client.ts` refreshes inside `navigator.locks` "refresh" (one lock request per in-tab single flight) and broadcasts `signed-out` on `BroadcastChannel("auth")`; receiving tabs clear without re-broadcasting; both injectable and off when absent, plus `signOut()` and `dispose()`; Vitest with a fake lock and channel shared by two clients (1e32c4e)
- [x] Auth UI: `AuthProvider` (`booting | anonymous | authenticated`, `role`/`username` decoded from the JWT payload for display only) boots with one refresh behind a splash; `/login` (react-hook-form; 401 "Invalid username or password", 429 with the Retry-After seconds); `RequireAuth` redirects with `from`; client `logout()` posts `/auth/logout` without a body and signs out whatever the result; login, logout and any signed-out event clear the one Query cache; placeholder home with sign-out; Testing Library + MSW tests (c4f927b)
- [x] Expense list (`/`, version 1.2, server count and total) and archived (`/archived`, newest `archivedAt` first) screens with empty and error states, a minimal toast and a nav layout with Sign out, tested with MSW (900ad97)
- [x] Expense detail screen at `/expenses/:id`: every `ExpenseResponse` field; 404 and 400 both show "Not found"; the query client no longer retries 4xx (7037264)
- [x] Create expense form at `/expenses/new` with zod validation, server field errors and `INVALID_CATEGORY` handling (2d27d8e)
- [x] Edit (PUT with version), inline description edit (PATCH) and confirmed delete (`DELETE ?version=`) on the expense detail page; 409 `CONCURRENT_MODIFICATION` keeps the input and offers Reload, 409 `MODIFY_ARCHIVED` says it was deleted and goes to the list; the create form's fields and resolver are shared (a245640)
- [x] Frontend image and nginx config: multi-stage `frontend/Dockerfile` (node 24 to nginx-unprivileged on 8080), `nginx.conf` with API proxy, SPA fallback, cache and security headers, and `build_docker_image.sh` (6d958b3)
- [x] Compose `web` service (`spring-web`, 8081) at fixed IP 172.28.0.10 on a pinned 172.28.0.0/24 `app-network`; `TRUSTED_PROXIES` is only that address; app port bound to 127.0.0.1; `run_compose.sh` builds both images (0696c25)
