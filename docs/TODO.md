# TODO

Last investigation: 2026-10-23 — UI alignment and polish audit in Chromium at 1280/768/375/320px, light and dark, 18 findings (see Web UI alignment and polish)

Findings from the project review on 2026-10-12, plus later investigations. Paths are relative to
`backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

Work items top to bottom, one per commit. When an item is fixed, move it to **Done** with its
commit hash. Items that need a human decision or action outside the code go in **Needs you**.

## Tooling

- [ ] **Give the e2e run its own image tags.** `frontend/run_e2e.sh` runs `backend/build_docker_image.sh`
      (`./mvnw clean install`, then `docker build -t expense-tracker:1.0`) and `frontend/build_docker_image.sh`
      (`expense-tracker-web:1.0`), and `docker_compose/docker-compose.e2e.yml` runs those tags. So every e2e run
      replaces the images the main Compose stack (`docker-compose.yml`) uses with a build of the working tree, and
      `clean` wipes `backend/target`. Fix:
      - both build scripts take an `IMAGE_TAG` environment variable, default `1.0`, so running them with no
        arguments still builds `:1.0`
      - `backend/build_docker_image.sh` runs `./mvnw package` instead of `clean install`
      - `run_e2e.sh` builds with `IMAGE_TAG=e2e`, and `docker-compose.e2e.yml` runs `expense-tracker:e2e` and
        `expense-tracker-web:e2e`
      - update any README, CLAUDE.md or script comments that name the tags

      Verify without running e2e: `sh -n` on the three scripts, `docker compose -f docker_compose/docker-compose.e2e.yml config`
      shows the `:e2e` images, and `docker-compose.yml` still names `:1.0`. Unattended runs still must not run
      `run_e2e.sh` or `npm run e2e`; the owner runs it once afterwards.

## Web UI alignment and polish (2026-10-23 audit)

Measured with Playwright against the Vite dev server (API stubbed) at 1280, 768, 375 and 320px, light and dark, with
classic scrollbars. Axe found no violations and no page scrolls sideways, even at 320px. All findings are layout and
visual. Spec: `docs/ui-design-proposal.md` (cited as "spec"). Work top to bottom: item 1 changes every size, so
do it first and re-measure the rest after it.

**How to test every item (required).** A fix for one width must not move the other:
1. Before the change, record screenshots and `getBoundingClientRect()` of the affected elements at **1280, 768 and
   375px** (320px for anything that wraps), in light and dark. The 48rem (768px) breakpoint is where the nav,
   tables and FAB change.
2. Decide which widths the change is meant for. A phone-only rule goes in `@media (max-width: 47.999rem)` (or a base
   rule that a 48rem block overrides). A desktop-only rule goes in `@media (min-width: 48rem)`. A shared rule
   needs a reason in the commit message.
3. After the change, compare again. Widths the fix is not meant for must be pixel-identical (allow ±0.5px).
   Use `isMobile`/`hasTouch` for the phone run, because `(pointer: coarse)` changes `--fs-input`.
4. Run `npm test -- --run` and `npm run build`; `components.test.ts` and `tokens.test.ts` guard the CSS.

- [ ] **Add a layout regression spec.** All of the above slipped past jsdom and axe. Extend `e2e/a11y.spec.ts`
      (it already runs 360 and 1280, light and dark) or add `e2e/layout.spec.ts` with these assertions:
      - controls in one row share their top and bottom edges (±1px)
      - the nav does not move between a long and a short list
      - no text below 10px
      - inputs are ≥ 16px on the touch project
      - targets are ≥ 24px (≥ 44px on touch)
      - single-word chips and amounts stay on one line

      Runs under `npm run e2e` (Compose stack), not in unattended runs.

## Needs you

- [ ] **Check the animated README diagrams on GitHub.** The four SVGs in `docs/diagrams/` (login, request,
      refresh, logout) were checked in local Chromium through `<img>`, never on github.com. On the README there:
      - each diagram shows and animates (flowing dashes, a packet walking the success path); also try Firefox
        and Safari, and a phone
      - switching GitHub's theme (Settings → Appearance) swaps the light and dark versions
      - the text is readable at README width, and the flows match the code and the sections around them
      - the "All flows in one Mermaid chart" block under Authentication Architecture opens and renders
      Fix anything in `docs/diagrams/build.mjs`, then run `node docs/diagrams/build.mjs`.

## Done

- [x] Client IP behind nginx checked (2026-10-23): a login through `:8081` stored the host address `172.28.0.1`, not nginx's `172.28.0.10`, and a forged `X-Forwarded-For: 1.2.3.4` was ignored
- [x] Admin stays a fourth phone tab for admins (decided 2026-10-23); the spec now says so
- [x] Ran `frontend/run_e2e.sh` and clicked through every screen with the keyboard only and on a narrow window (2026-10-23)
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
- [x] Frontend sortable list: SortableHeader columns and a phone-only Sort by select write `sort` to the URL (dd3ecfc)
- [x] Frontend: search, period chips and filters on the expense list (09128ea)
- [x] Frontend: phone rows as cards and day grouping under the date sort (90197e8)
- [x] Frontend: summary card above the expense list with category breakdown bar and legend (801b239)
- [x] Backend: sort on the admin user list, INVALID_SORT on unknown values (0693c71)
- [x] Frontend: sortable admin users with SortableHeader and INVALID_SORT reset (d8a102d)
- [x] Backend: optional display name (V17, PATCH /users/me, INVALID_DISPLAY_NAME, on user and admin responses) (a746106)
- [x] Frontend: display name (useMe, Profile add/edit/clear, initials from displayName in Profile, admin and account menu) (a6d1b8c)
- [x] Frontend e2e: list.spec.ts (sort, category, paging, search) and a11y.spec.ts (axe with contrast, light/dark, 360/1280 px; @axe-core/playwright 4.13.0) (9b8282d)
- [x] README documents the UI design system, preferences, list 1.3, summary and display name; UI design proposal marked implemented (f8cd8bf)
- [x] A NUL or other control character in an expense description is now a 400 VALIDATION_ERROR instead of a 500 (15194e3)
- [x] The summary endpoint takes the list's filters (q, category, amounts) and the UI sends them, so the card's breakdown agrees with its total (9dbda12)
- [x] The search box keeps a trailing space after the debounce instead of copying the trimmed URL value back (152b5d9)
- [x] Display names now refuse format (zero-width, bidi, BOM) and line/paragraph separator characters and names with nothing visible, in the backend and the Profile form (775fdca)
- [x] Unpaired UTF-16 surrogates in expense descriptions and display names are now a 400 instead of being stored as "?" (3b43f5e)
- [x] The expense search is capped at 100 characters in the box and in a q read from the URL, so a long search no longer blanks the list (588c5ae)
- [x] A page past the end (old link, or the last item of the last page deleted) now moves to the last page instead of showing an empty table, on the expense list and the admin users list (67eaa45)
- [x] Summary ties (equal totals) are now ordered by category name like the list's sort=category, not by enum position, with a tie test (7060912)
- [x] The admin user list shows the creation date in the viewer's time zone (`formatLocalDay`), with time zone tests (831e0aa)
- [x] Fixed docs and comments that contradicted the code (RENT category, X-API-Version, UTC+14 dates, display name 409) (99884a9)
- [x] Admin area pill moved from the top bar to the admin page headings, nowrap on top bar items (0ec2025)
- [x] Category filter chips now centre their label like Period chips (`label:where(:has(...))`) (9b76bc7)
- [x] Min/Max amount and From/To filters laid out as Dates/Amount fieldsets in two columns (0ebad6f)
- [x] Collapsed the expense Filters panel at every width, with removable active-filter chips (d2e9e0f)
- [x] Space Profile, expense detail and admin user page bodies with a `.stack` grid (6a76055)
- [x] Fixed the account menu: Close hidden on desktop, desktop shadow, monitor icon for Your devices, RoleChip (d4d6771)
- [x] Removed the lines inside phone expense cards and kept "Sort by" on one line (62a6ee1)
- [x] Hide the pager when there is nothing to page and make the page-size select auto-width (64ca84e)
- [x] Tidied the desktop expense table: right-aligned tabular amounts, date column hidden under day headers, whole-row link without underline (214e6e6)
- [x] Gave the summary bar and legend dots strong category colours (266ec8b)
- [x] Admin user filter laid out as one filter-bar row with field labels (36ebbd5)
- [x] Restructured the admin user page into header, Details and Access cards with segmented Status and Role (f4a3a03)
- [x] Slimmed the expense detail page: one Edit, danger-ghost Delete, category chip only, Technical details block (77a18cc)
- [x] Profile page: header row, RoleChip, .note warning, PasswordField, device divider list; Theme/Accent only in the account menu (a9369ef)
- [x] Debounced the Min/Max amount filters (300 ms) and made typed filters replace the history entry (dd6c83c)
- [x] Root font size set to 100% so rem is 16px; h1 sized per spec; desktop top bar items share one height (922a09f)
- [x] Reserved the scrollbar gutter on the root so content no longer shifts sideways between long and short pages (f3efe15)
- [x] Removed global control margins; forms/fields space with gap, controls align in rows (e7a4cec)
- [x] Forms share one 28rem column with full-width inputs and flush chip/segmented legends (57e55cd)
- [x] "Add expense" FAB shown only on the list on phones, main bottom padding sized from tab bar and FAB (d4702fb)
- [x] Table cells no longer break inside words and amounts; Archived amounts right-aligned with tabular-nums (dd06d06)
- [x] Fixed the Status/Role segmented controls: equal-width items, inset ring on the selected one (39ba4a5)
- [x] Save row inside the Access card no longer shows a page-colored strip (8b480a6)
- [x] Admin user header chips: one chip height, flex gap, phone wrap with top-aligned avatar (278e1dc)
- [x] Login/Register: accent blobs isolated and no scrollbar on the empty page (100dvh, no body bottom padding); the password eye toggle was left for later (166e377)
- [x] Filters panel hierarchy: bolder ink legends, wider 2-col grid, --line divider (e53e59d)
- [x] Sticky top bar shows --shadow-1 only once scrolled, via an IntersectionObserver sentinel (54117d7)
- [x] Phone account menu sheet now has a tap-to-close scrim, a 4x32px handle and a secondary Close button (5a5189c)
- [x] Empty filter results use EmptyState with Clear filters / Clear search (a26ecb5)
- [x] Ghost buttons in text rows align with the text around them (f064805)
- [x] Token hygiene: tokens only in component CSS, `.visually-hidden` reused, tokens.test.ts checks every var() (2757620)
- [x] Stop useCachedMe logging "No queryFn was passed" on every page, via skipToken (5096ee8)
- [x] Show password as an eye icon toggle inside the field, so Password matches Username width (c11c233)
