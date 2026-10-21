# TODO

Last investigation: 2026-10-20 08:00 — 3 new findings (web UI add-expense flow)

Findings from the project review on 2026-10-12, plus later investigations. Paths are relative to
`backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

Work items top to bottom, one per commit. When an item is fixed, move it to **Done** with its
commit hash. Items that need a human decision or action outside the code go in **Needs you**.

## UI design

From docs/ui-design-proposal.md. Work in order. Frontend paths start with `frontend/`. Each item keeps
`npm test -- --run` and `npm run build` (and `./mvnw test` for backend items) green, and updates the
`frontend/e2e/*` selectors it breaks in the same commit (running `run_e2e.sh` is optional; say if it was not run).
Phone vs wide is CSS only: one markup for every size, never two copies of a nav, list or control in the DOM.
      `/{uniqueId}`). Proposal: Backend changes 2.
- [ ] **Frontend: sortable list.** `SortableHeader` on the list table (Description, Category, Date, Amount) writing
      `sort` to the URL, plus a "Sort by" select (Newest / Oldest / Highest amount / Lowest amount / Description A–Z / Z–A
      / Category) writing the same param, shown by CSS only under 48rem. Test: header click sets `aria-sort`, URL and
      request `sort=amount,desc`; second click flips; live region text; the select sends the same params. Careful: the
      select's name must not clash with the header buttons. Proposal: Sorting.
- [ ] **Frontend: search, period chips and filters.** Search "Search descriptions" (300 ms debounce, `q`); period chips
      This month (default) / Last month / Last 3 months / This year / All time / Custom writing `from`/`to` in the local
      calendar like `todayIso`; a Filters disclosure (one markup; collapsed on phones by default) with category checkbox
      chips, date range and min/max amount; active-count on the Filters button; "Clear filters"; "No expenses match these
      filters." when `total` is 0 with filters. Test: URL and request params per control, debounce with fake timers,
      period dates for a fixed now, no-match, clear. Careful: never `toISOString` for dates. Proposal: Expenses (home).
- [ ] **Frontend: phone rows and day grouping.** Restyle the same list table by CSS into cards under 48rem (whole row is
      the link, link text stays the description, category icon, amount right). When sorted by date, group rows into a
      `<tbody>` per day with a header row (`<th scope="rowgroup" colspan>`: Today / Yesterday / "Oct 19 · Sun");
      other sorts are flat. Numbered pages on every size (no Load more). Test: group headers only for the date sort, links
      still found by description. Proposal: Expenses (home).
- [ ] **Frontend: summary card.** Hero card above the list with the server `total_amount` and `total` of the current
      filters, and a category breakdown from `GET /api/expense/summary` (key `["expenses", "summary", {from, to}]`): a
      stacked bar of category fills (`role="img"`, `aria-label` with amounts and percentages) and a text legend. Test:
      numbers from mocks, legend, `aria-label`, refetch after delete; add a summary handler to every test file that
      renders `/` (`expenses.test.tsx`, `a11y.test.tsx`, others found by grep), since MSW errors on unhandled requests.
      Careful: never sum amounts in the browser; percentages only size the bar. Proposal: Expenses (home), Backend 2.
- [ ] **Backend: admin user list sort.** `@RequestParam(required = false) String sort` on `user/AdminUserController.list`
      and a `sort` argument to `UserService.listUsers` (only caller `AdminUserController.java:58`): `createdAt` (default
      asc), `username` (by `lower(username)`), `role`, `enabled`, each asc/desc, always then `id` asc; unknown → 400
      `INVALID_SORT`. Update README admin `GET /users` ("ordered oldest first", README.md ~1095-1104). Test:
      `AdminUserTests` (each field and direction, default unchanged, `INVALID_SORT`). Careful: don't touch
      `requireEnabledAdmin` or `@PreAuthorize`. Proposal: Backend changes 3.
- [ ] **Frontend: sortable admin users.** `SortableHeader` on `/admin/users` (Username, Role, Status, Created) with
      `sort` in the URL (resets page); `INVALID_SORT` resets like `INVALID_PAGE` (`AdminUsersPage.tsx:23-25,83-96`).
      Test: `admin.test.tsx` (header click → `sort=username,asc`, `INVALID_SORT` reset). Proposal: Sorting, Admin.
- [ ] **Backend: display name.** Migration `V17__add_display_name_to_users.sql`: `ALTER TABLE users ADD COLUMN
      display_name VARCHAR(100);`. `User.displayName`; `displayName` on `UserResponse` and `AdminUserResponse`
      (`UserMapper`). `PATCH /users/me` in `user/UserController` with `{displayName}` (no version check): trimmed, 1–100
      chars, no control characters, empty string clears it; else 400 `INVALID_DISPLAY_NAME`; returns `UserResponse`.
      README self-service section. Test: a USER (not only ADMIN) gets 200, trim, clear, invalid values, `GET /users/me`
      returns it; `RegisterTests` still pass (`POST /auth/register` returns `UserResponse`). Careful: no change to
      `JWTService`, login, refresh or `SecurityConfig` (`/users/me` is already matched before `/users/**`).
      Proposal: Backend changes 5.
- [ ] **Frontend: display name.** `useMe()` hook (`["me"]`, `displayName`); Profile Account card "Add your name" / Edit
      inline form (PATCH `/users/me`, `INVALID_DISPLAY_NAME` on the field); initials from `displayName ?? username` in
      Profile, the admin list (if the DTO has it), and the account menu once `["me"]` is in the cache (the shell itself
      must not fetch it). Test: `profile.test.tsx` (edit, clear, error, initials change). Careful: render as text only.
      Proposal: Initials.
- [ ] **E2E: list spec and axe with contrast.** Add `frontend/e2e/list.spec.ts` (create ~25 expenses via the API, then
      sort by amount, filter by category, page and search in the UI) and the `@axe-core/playwright` dev dependency (exact
      version) with `e2e/a11y.spec.ts`: main screens in light and dark (`page.emulateMedia({ colorScheme })`) at 360 and
      1280 px with `color-contrast` on; screenshots as artifacts, not baselines. Test: `npm run e2e` (needs Docker),
      `npm run build`. Careful: needs network for `npm install`; if unavailable, add a Needs you entry instead.
      Proposal: Testing.
- [ ] **Docs: README and proposal done.** README "Web UI" (design system, theme/accent/currency preferences in
      `localStorage`, screens, list 1.3), section 17 API versions (1.3 params, response, error codes; summary endpoint;
      `PATCH /users/me`), Roadmap; `frontend/README.md` if tracked (fonts and OFL, styles layout, pinned TZ/locale in tests);
      `CLAUDE.md` if commands changed. Set `docs/ui-design-proposal.md` to "Status: implemented (date). ..." like
      `docs/web-ui-proposal.md`. Test: none; check names against the code. Proposal: whole document.

## Needs you

- [ ] **Manual checks once the Web UI items are done.** (1) Compose: update `TRUSTED_PROXIES` in your
      `docker_compose/.env`, log in through `:8081` and check that `user_sessions.ip_address` holds your client
      IP, not nginx's. (2) Run `frontend/run_e2e.sh`. (3) Click through every
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
- [x] E2E stack and Playwright suite: `docker-compose.e2e.yml` (project `expense-tracker-e2e`, web on 127.0.0.1:18081, subnet 172.29.0.0/24, seeded `e2e-admin`, 75 s access tokens because the UI refreshes 60 s early, raised `APP_RATELIMIT_*`), six specs in `frontend/e2e/` and `run_e2e.sh` (093072e)
- [x] Register page at `/register`: zod rules mirroring `UsernameValidator`/`PasswordValidator` (stripped ASCII name up to 100, password 12 chars to 72 bytes, not the username), then logs in through `AuthProvider`; `USERNAME_TAKEN`/`INVALID_USERNAME` on username, `INVALID_PASSWORD` on password, 429 form-level with `Retry-After`; login and register link to each other (7a3b811)
- [x] Profile page at `/me`: account from `GET /users/me`; password change with zod rules shared with register (12 chars to 72 bytes, not the username), `INVALID_CURRENT_PASSWORD` on the current field, `INVALID_PASSWORD` on the new one, 429 form-level with `Retry-After`, success logs out to `/login`; "Your devices" from `GET /users/me/sessions` marks this device, inline-confirmed revoke one (this device logs out) and sign out other devices (08ff61a)
- [x] Admin users screen at `/admin/users` (Admin link and routes only for an `ADMIN` token): username/status filters and server paging in the URL, `INVALID_PAGE` resets page and size; `/admin/users/:id` PATCHes changed `enabled`/`role` with `version`, inline confirm before disable or demote; `CANNOT_MODIFY_SELF`, `LAST_ADMIN`, `EMPTY_PATCH` at the form, `CONCURRENT_MODIFICATION` keeps the input and offers Reload, 403 says "You no longer have admin access" (2df9ae4)
- [x] Accessibility and responsive pass: error text tied to inputs (`aria-describedby`/`aria-invalid`), shared `PageHeading` takes focus after navigation (not on first load or refetch), failed submit focuses the first invalid field or the form alert, inline confirms focus Cancel and return focus, skip link, `src/styles.css` with focus rings, wrapping nav and scrollable tables for ~360px; `vitest-axe` on every screen with `color-contrast` off (047f573)
- [x] Documented the web UI in README.md, CLAUDE.md and docker_compose/README.md, marked its proposal implemented (514b57b)
- [x] The web UI shows a role change from any refresh: the client emits `onSession` when it stores a new token, `AuthProvider` updates only when role or user changed, keeps the Query cache for the same user and clears it if a refresh names another user (af997ca)
- [x] Fixed docs that contradicted the code: Compose defaults `TRUSTED_PROXIES` to the web service's address, and the admin user screen has no sessions (8bd3db7)
- [x] `expense.unique_id` is unique (V16 `ux_expense_unique_id`, failing with the duplicated ids if any exist); V1's plain `index_expense_unique_id` is dropped (38f8cc4)
- [x] Pinned the backend image to `eclipse-temurin:25.0.4_7-jre-noble` (JRE; was the floating `eclipse-temurin:25`), so a rebuild cannot silently change the JVM (04032bb)
- [x] The web UI shows "Never" for an expense with a null `lastModified` instead of blanking the page after Add expense; the create mocks now send `null` (1a660d2)
- [x] The web UI shows "—" for legacy expenses with null description, amount, category, date or createdAt instead of crashing the list, archived and detail pages, and the edit form starts those fields empty (d88fc78)
- [x] A render error in a page no longer blanks the app: `Layout` wraps the `Outlet` in an `ErrorBoundary` keyed by the path, showing "Something went wrong" with a link back to the list, and navigating recovers (4ccd1ba)
- [x] Added design tokens and contrast test (ebb5783)
- [x] Theme and accent bootstrap in main.tsx with theme-color metas (596719c)
- [x] Bundled JetBrains Mono (Latin 400/500/700 woff2 + OFL, base.css @font-face, assetsInlineLimit 0, Regular preload) (c170e99)
- [x] Restyle native elements with tokens: styles.css split into base/layout/components (8769dc7)
- [x] Icons and Button components, used by the submit buttons (617c5a6)
- [x] Field components: TextField, SelectField, DateField, AmountField in ui/fields.tsx (d22cd25)
- [x] Chips and segmented control: ChipGroup, SegmentedControl, CategoryChip (0dc00f3)
- [x] Card, Skeleton and EmptyState added and used for loading, empty and error states (536107b)
- [x] Added initials, hueFor, Avatar and PreferencesProvider with tests (6bc85a7)
- [x] App shell: top bar, one responsive Main nav, Add expense link, h1 PageHeading (dc132b6)
- [x] Account menu in the top bar replacing "Signed in as" and the nav Sign out (24dd7bf)
- [x] Success toasts: showSuccess in Toast.tsx (4 s, paused on hover/focus) for add, save, description, delete and session sign-outs (00eb77d)
- [x] Dialog for expense delete (4851bc3)
- [x] Money and date formatting: formatMoney/date helpers, local times, no "(UTC)" labels, Profile currency select, TZ/locale pinned for Vitest and Playwright (55f43a3)
- [x] Login and Register restyle: card, blobs, password toggle, rules checklist (6d26cbe)
- [x] Add/edit form: amount first, category chips (ee770f1)
- [x] Add form: Today/Yesterday date chips, back to the list with a highlighted row, Add another (f0fe9ba)
- [x] Expense detail restyle: hero, Details card, shortened id with copy, back links (27ff8ea)
- [x] Profile cards (Account, Appearance, Security, Your devices) and device names (b3e391e)
- [x] SortableHeader and archived list sorting in the browser, retention note, muted rows (9d0b2ff)
- [x] Admin restyle: user avatars and chips, detail header card, Admin pill, ui/Pagination extracted (1c889b1)
- [x] Backend expense list 1.3: paging, sort (NULLs last) and filtered total (486f7e4)
- [x] Backend expense list 1.3 filters: q, category, from/to, minAmount/maxAmount (41d0305)
- [x] Backend expense summary: GET /api/expense/summary with from/to and per-category totals (36432d3)
- [x] Frontend: list on version 1.3 with URL params and paging (a529f32)
