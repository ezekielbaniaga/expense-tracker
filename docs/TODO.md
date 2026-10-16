# TODO

Last investigation: 2026-10-16 20:21 — 8 new findings

Findings from the project review on 2026-10-12, plus later investigations. Paths are relative to
`spring-boot-maven-sample/backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

Work items top to bottom, one per commit. When an item is fixed, move it to **Done** with its
commit hash. Items that need a human decision or action outside the code go in **Needs you**.

## To do

- [ ] **`@PastOrPresent` on the expense date uses the JVM zone from startup, not the UTC `Clock`.**
      `expense/dto/CreateExpenseRequest.java`, `expense/dto/UpdateExpenseRequest.java`. Hibernate Validator's
      default `ClockProvider` captures `Clock.systemDefaultZone()` once, so the check ignores `ClockConfig` (and
      a test clock) and changes with the host zone. In the UTC container a user in Manila (UTC+8) cannot record
      an expense dated today before 08:00 local time. Verified with a throwaway test: the date that is today in
      `Pacific/Kiritimati` (2026-10-17) got 400 while UTC was still 2026-10-16, whatever the JVM default zone was
      set to at request time. Fix: a `ValidationConfigurationCustomizer` bean that sets a `ClockProvider` built
      from the `Clock` bean, offset to UTC+14 (`clock.withZone(ZoneOffset.ofHours(14))`), so "present" means
      today anywhere on Earth; document it next to the README UTC note. Test: with a fixed clock at
      2031-03-30T12:00Z, date 2031-03-31 is accepted (today in UTC+14) and 2031-04-01 is 400, independent of
      the JVM zone.
- [ ] **Per-IP rate limits are keyed by the full IPv6 address.** `ratelimit/KeyedRateLimiter.java`,
      `auth/service/LoginRateLimiter.java`, `auth/service/AuthEndpointRateLimiter.java`. A single IPv6 host
      usually controls a whole /64 (2^64 addresses), so rotating source addresses gets a fresh bucket each time
      and bypasses register (10/hour), login-per-IP (20/minute), refresh and logout limits; it also fills the
      `max-keys` map. Not verified (Compose is IPv4 only today; it matters once a proxy forwards IPv6 clients).
      Fix: normalize the client IP key in one place (e.g. `ClientIpKey.of(remoteAddr)`): IPv4 as is, IPv6
      (including IPv4-mapped and zone ids) reduced to its /64 prefix. Test: unit test of the key function, and
      a register test where `2001:db8::1` and `2001:db8::2` share one bucket while `2001:db8:0:1::1` does not.
- [ ] **Native query `LocalDateTime` parameters still go through the JVM zone and shift by an hour in a DST
      gap.** `session/UserSessionRepository.java` (`deleteEndedBefore`), `expense/ExpenseRepository.java`
      (`deleteOldExpense`); claim in `application.yml` (`java_time_use_direct_jdbc` comment) and README
      "Timestamps are UTC". Verified with a throwaway test under `Europe/Berlin`: a native parameter
      `2031-03-30T02:30` arrived as `2031-03-30 03:30:00`, while the same value in a JPQL `UPDATE` (`revokeAll`)
      and in entity saves was stored unchanged. So on a non-UTC DST host the cleanup cutoffs are an hour late
      for one hour a year. Small effect, but the "bound as-is" guarantee doesn't hold for native queries and
      `SessionClockTests.cleanupCutoffFollowsTheClock` only runs under `Asia/Manila` (no DST). Fix: pass the
      cutoff as an ISO string and `CAST(:cutoff AS timestamp)` in both native queries (no zone involved), or
      select the ids in JPQL with a `Limit` and delete by id; correct the yml comment. Test: run the cleanup
      under `Europe/Berlin` with the clock set so the cutoff is 2031-03-30T02:30 and check a session revoked
      at 02:45 survives and one at 02:15 is deleted.
- [ ] **Expense cleanup still runs 60 times at 2AM, 1,000 rows each.** `expense/job/ExpenseCleanup.java`
      (`cron = "0 * 2 * * *"`). Session cleanup was changed to one run with batches until a short one (cb79386);
      expense cleanup still logs 60 INFO pairs a night, mostly "Affected Rows: 0", and stops at 60,000 rows.
      Fix: same loop as `UserSessionCleanup` (once at 02:00, batches of 1,000 until short, at most 100, each its
      own transaction through `ExpenseService`), retention in a property like `app.session.retention`. Test:
      like `UserSessionCleanupTests`: 2,500 archived rows past retention are all deleted in one `cleanup()` call
      in 3 batches; a recent archived and an active expense remain.
- [ ] **Docs lag the code in three places.** (1) `CLAUDE.md` "Running locally" lists only `ADMIN_PASSWORD`
      and `JWT_SECRET`; since 6953c86 a run outside Compose also needs `SPRING_PROFILES_ACTIVE=dev`
      (`run_project.sh`, `debug_project.sh`) or `SPRING_DATASOURCE_*`, else startup fails on the datasource.
      (2) `src/test/.../TestcontainersConfiguration.java` Javadoc says it overrides "the localhost settings in
      application.yml", which no longer has any. (3) README "Security components" tree omits
      `LoginRateLimiter`, `AuthEndpointRateLimiter`, the bootstrap services and the `ratelimit/` package, and
      the Roadmap "Completed" list has no rate limiting, HS256/issuer pinning or the UTC clock. Fix: update the
      three texts. Test: none (docs); check by reading against `application*.yml` and the package list.

## Needs you

- [ ] Old secrets from `docker_compose/.env` remain in git history. Rotate them before any real deployment.
- [ ] **Untracked files in the repo root.** `to_delete_just_spring_boot_note` (a psql dump of a session row, its
      name says delete), `.claude/` (the skills) and `docs/jobs/` (the nightly loop notes, marked Draft). Delete
      the note, and commit or ignore the other two.
- [ ] **Decide on login lockout abuse.** `auth/service/LoginRateLimiter.java`. The per-username bucket
      (5 failures per 15 minutes, any IP) refills one token every 3 minutes, so one wrong guess every 3 minutes
      keeps an account locked indefinitely, even for the right password; one IP within its 20/minute limit can
      do that to about 60 accounts, including the default `admin`. README section 1 says "the IP limit slows that
      down", which understates it. Options: accept (README wording fixed), or key the strict bucket by
      username + client IP and add a looser global per-username bucket (e.g. 100 failures per hour), or let a
      correct password through a locked username from an IP that has logged in successfully before.

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
