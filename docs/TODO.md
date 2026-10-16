# TODO

Last investigation: 2026-10-16 16:40 — 21 new findings, Needs you settled

Findings from the project review on 2026-10-12, plus later investigations. Paths are relative to
`spring-boot-maven-sample/backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

Work items top to bottom, one per commit. When an item is fixed, move it to **Done** with its
commit hash. Items that need a human decision or action outside the code go in **Needs you**.

## To do

Session-management review of 2026-10-16 (afternoon). Ordered by importance; each is one commit with a test.
All 176 tests passed at the time of the review.

- [ ] **Logout with an already-rotated refresh token does nothing.** `UserSessionService.revokeSession` only looks
      in `user_sessions.refresh_token_hash`. A client that refreshed, lost the response (or has a stale token in
      a second tab) and then logs out sends a used token: it gets 204 and the session stays active for up to 30
      days. Fix: if the hash isn't a current token, look it up in `used_refresh_tokens` and revoke that token's
      session (no reuse WARN; it is the owner logging out). Still always 204, unknown tokens still ignored.
      Test: refresh, logout with the *old* token, assert the session is revoked and the new token can't refresh.
- [ ] **`used_refresh_tokens` grows without bound inside one session.** Every refresh adds a row that stays
      until the session is deleted (30 days + 7). `/auth/refresh` has no rate limit, so anyone holding one valid
      refresh token can loop and fill the table; a normal client adds ~2,900 rows per session per month. On
      each rotation, delete all but the newest 20 used hashes of that session (one DELETE ... WHERE session_id
      = ? AND token_hash NOT IN (newest 20)). A token older than that is then "unknown" (plain 401) instead of
      "reuse", which is acceptable: it is no longer current. Test: rotate 25 times, assert 20 rows remain and
      the newest used token still triggers reuse detection. Update README section 11 (reuse) to say it.
- [ ] **A reuse-looking replay on an already ended session logs a WARN and re-stamps it.** `handleUnknownToken`
      always calls `revoke` and logs "Refresh token reuse detected" even when the session is already revoked or
      expired (e.g. an old token replayed after a normal logout). Only revoke and WARN when the session is still
      active; otherwise answer 401 quietly (DEBUG). Keeps the WARN meaningful as an alert. Test: logout, replay
      an old rotated token, assert `revoked_at` is unchanged.
- [ ] **Overlong or odd `ip_address` can fail a login with 500.** `user_sessions.ip_address` is `VARCHAR(45)`
      and `getRemoteAddr()` is stored as is. An IPv6 address with a zone id, or any `X-Forwarded-For` value once
      the proxy decision in **Needs you** is made, can exceed 45 and fail the insert, like the User-Agent bug
      fixed in 077aedb. Truncate to 45 in `createSession` (next to `truncateUserAgent`). Test: login through
      MockMvc with `remoteAddr` of 60 characters, assert 200 and a 45-character stored value.
- [ ] **Trust the reverse proxy's `X-Forwarded-For` (decided 2026-10-16: the app runs behind a proxy).**
      Today `AuthController.login` stores `request.getRemoteAddr()`, which behind a proxy is the proxy's IP
      for every session, and the rate-limit items below need the real client IP. Set
      `server.forward-headers-strategy: native` (Tomcat's RemoteIpValve), not `framework`, which trusts the
      header from anyone. `Careful:` the valve trusts private ranges by default (10/8, 172.16/12, 192.168/16,
      127/8), and Compose publishes `8080:8080`, so a client hitting the app directly through the Docker port
      mapping arrives from the bridge gateway (172.x), is treated as a trusted proxy, and can spoof its IP.
      Pin `server.tomcat.remoteip.internal-proxies` to the proxy's address through an env var, and say in the
      Compose README to stop publishing 8080 once the proxy is in front. Test: a `RANDOM_PORT`
      `@SpringBootTest` (MockMvc skips the valve) logs in from 127.0.0.1 with `X-Forwarded-For: 203.0.113.7`
      and the session lists `203.0.113.7`; with `internal-proxies` set to something else it lists 127.0.0.1.
      Needs the `ip_address` truncation item above first, since the stored value now comes from a header.
- [ ] **Rate limit `/auth/login` with Bucket4j (decided 2026-10-16).** Add `bucket4j_jdk17-core` and an
      in-memory limiter (per instance, which is fine for one instance; note it in the README). Two buckets per
      attempt: per normalized username (e.g. 5 failures per 15 minutes, so one account can't be guessed from
      many IPs) and per client IP (e.g. 20 attempts per minute, so many accounts can't be sprayed from one IP).
      Count failures only for the username bucket, so a user who logs in fine is never locked out by their own
      success. Over the limit: `429` with the `ErrorResponse` body, code `TOO_MANY_REQUESTS`, and a
      `Retry-After` header; answer 429 for unknown usernames too, so the limit doesn't reveal which accounts
      exist. Keep the maps bounded (Caffeine with expire-after-access, or Bucket4j's own expiring map) so
      random usernames can't grow memory forever. Limits in `app.rate-limit.*`. Tests: the 6th wrong
      password for one user is 429 with `Retry-After`, another user from the same IP is unaffected until the IP
      limit, and a correct password after the window passes. Depends on the proxy item for the client IP.
- [ ] **Extend the rate limit to `/auth/register`, `/auth/refresh` and `/auth/logout` (decided 2026-10-16).**
      Per client IP, reusing the limiter from the login item; register stricter (mass account creation),
      refresh and logout looser (a normal client refreshes every 15 minutes per tab). Same 429 body and
      `Retry-After`. Tests: one per endpoint over its limit. Update the README's "no login throttling yet"
      line in section 17 and the roles table.
- [ ] **A signed token without `uid` or `role` gives 500, not 401.** `JWTService.toPrincipal` calls
      `UUID.fromString(claims.get("uid", String.class))`; a missing claim is a `NullPointerException`, which
      `parsePrincipal` doesn't catch (it catches `JwtException | IllegalArgumentException`). Only a token signed
      with our key can hit it (an older or hand-made one), but the filter should never 500. Treat a missing or
      blank `uid`/`role`/subject as invalid (throw `IllegalArgumentException` in `toPrincipal`). Test in
      `JWTServiceTests` with a token built without `uid`, and one MockMvc call returning 401.
- [ ] **Pin the JWT algorithm to HS256.** `signWith(signingKey())` lets jjwt choose the algorithm by key length: 32-47 bytes give HS256, 48-63 give
      HS384, 64+ give HS512, so a longer secret silently changes `alg` while the README and `JWTProperties`
      say HS256. Use
      `signWith(signingKey(), Jwts.SIG.HS256)` and `.verifyWith(...)` with an explicit check of the header
      `alg` (reject anything else). While there, add an `iss` claim (e.g. `expense-tracker`) and
      `requireIssuer` in the parser, so a token from another service that shares the secret is rejected.
      Test: a 64-byte secret still produces an `alg: HS256` token, a token signed HS512 with the same key is
      rejected, and so is one without the issuer. Tokens issued before the change have no `iss`; accept a
      missing `iss` for one access-token lifetime, or accept that everyone refreshes once after deploy (a
      refresh needs no access token, so nobody is logged out).
- [ ] **Time handling depends on the JVM time zone.** All timestamps are `LocalDateTime.now()` in
      `TIMESTAMP WITHOUT TIME ZONE` columns, and the API returns them without an offset (`SessionResponse`
      `createdAt`/`lastUsedAt`/`expiresAt`), so a client can't tell which zone they are in. They are, compared in Java (`expiresAt.isBefore(now)`) and in tests/SQL with
      `now()`. A host or container with a non-UTC zone, or a DST change, shifts session expiry and the
      cleanup cutoff, and two instances in different zones would disagree. Add a `Clock` bean (UTC), inject it
      into `UserSessionService`, `UserService` and the cleanup, and set
      `spring.jpa.properties.hibernate.jdbc.time_zone: UTC`. Existing rows were written in server local time;
      the Compose image is UTC, so note in the commit that a non-UTC deployment needs its rows converted
      (no migration needed for this repo's setup). A fixed `Clock` also lets tests stop rewriting
      `expires_at` through JDBC. Returning UTC with an offset in the API is a response format change; leave
      that for a new API version or note it in the README.
- [ ] **Session lifetime, cap and retention are hard-coded.** `now.plusDays(30)`, `MAX_ACTIVE_SESSIONS = 10`
      and `RETENTION_DAYS = 7` live in code, while the access token lifetime is `app.jwt.expiration`. Add
      `app.session.lifetime` (30d), `app.session.max-active` (10) and `app.session.retention` (7d) in a
      `@ConfigurationProperties` class like `JWTProperties`, keep the defaults, and have the README say where
      they are set. Test: override the three in a `@SpringBootTest(properties=...)` and see them applied.
- [ ] **Cleanup runs 60 times a night and drains only 1,000 rows each.** `UserSessionCleanup` fires every minute
      from 03:00 to 03:59 and deletes at most 1,000 sessions per run, so it clears at most 60,000 a night and
      does 59 empty runs on most nights. Run once at 03:00 (`0 0 3 * * *`) and loop `cleanupEndedSessions`
      until a batch deletes fewer than the limit (each batch its own transaction, with a cap of e.g. 100
      batches so one run can't spin forever). Update the log line and the README sentence ("from 3AM").
      Do not edit the V10 comment that mentions the old schedule (applied migration). Test: seed 2,500 ended
      sessions, call the job once, assert all deleted.
- [ ] **Pin the accepted access-token window with a test.** The 15-minute window after a revoke is a decided
      design (see the session proposal), but no test says so, so a future "fix" could change it unnoticed.
      Add one test: revoke a session (and separately log out), assert the refresh token gives 401 while the
      old access token still gets 200 on `GET /users/me`, and `GET /users/me/sessions` no longer lists the
      revoked session. If someone later adds a per-request `sid` check, this test is the one to change on
      purpose.
- [ ] **Remove the dead `DebugController`.** `auth/DebugController.java` has its `@RestController` and
      `@RequestMapping` commented out and is `@Deprecated`; it only generates an admin token and would be
      a token-minting endpoint if someone re-enabled the annotation. Delete the file (git has it).
- [ ] **Quieter, safer defaults in `application.yml`.** Set `spring.jpa.open-in-view: false`: it is on by
      default (the test log warns about it on every context start), which keeps a database connection for the
      whole request and lets lazy loading happen in controllers. Every service already maps entities inside
      its transaction, so turning it off should change nothing; run the full suite to confirm.
      Also, `logging.level.org.flywaydb: DEBUG` ships in the main
      config (the Compose app logs every migration statement), and the datasource defaults
      (`devuser`/`devpwd` on localhost) are in the main file too. Set Flyway to `INFO`, and move the dev
      datasource to `application-dev.yml` (or leave only env-driven values), making sure `./mvnw test`,
      `run_project.sh`, `debug_project.sh` and the Compose file (which sets `SPRING_DATASOURCE_*`) still work.
      README/CLAUDE.md "Running locally" must say how to run without the default.

- [ ] **Health endpoint for the proxy and Compose (decided 2026-10-16).** Add
      `spring-boot-starter-actuator` with `management.endpoints.web.exposure.include: health` and
      `management.endpoint.health.show-details: never`, and `permitAll` for `/actuator/health` only in
      `SecurityConfig` (before `anyRequest`). Add a Compose `healthcheck` for the app; check whether the
      `eclipse-temurin` image has `curl` or `wget` first, and if not, use a small `HEALTHCHECK` in the
      Dockerfile that has one. Tests: `GET /actuator/health` without a token is 200 `{"status":"UP"}` with no
      details, and `/actuator/env` and `/actuator/beans` are not reachable (404 or 401).
- [ ] **README corrections.** Section 14 lists `ValidationException → 400`, but the class is
      `BadRequestException` and bean validation goes through `MethodArgumentNotValidException`; list what
      `GlobalExceptionHandler` really maps (404, 400s, 409, 403). Section 8's refresh flow diagram stops at
      not found / revoked / expired and leaves out the disabled-user and reuse branches that section 11
      describes. No code change.
- [ ] **Duplicate index on `users.unique_id`.** V5 created `index_users_unique_id` and V9 added the
      `uq_users_unique_id` unique constraint, which has its own index. Every user insert and update maintains
      both. Add a migration that drops `index_users_unique_id` (`DROP INDEX IF EXISTS`). Test: like
      `UserSessionCleanupIndexTests`, assert via `pg_indexes` that only the unique index remains and lookups
      by `unique_id` still work.
- [ ] **No size limits on the auth request bodies.** `RefreshTokenRequest.refreshToken` and
      `LoginRequest.username/password` are only `@NotBlank`. A refresh token is always 43 characters, so add
      `@Size(max = 128)` to it, and `@Size(max = 100)` to the login username (the column size). Leave the login
      password unbounded in length rules but cap it (e.g. 1,000) so a multi-megabyte body isn't hashed and
      logged around; it must not reveal the 72-byte rule, since old passwords may predate it. Tests: oversize
      values give 400 `VALIDATION_ERROR`.
- [ ] **Login and refresh don't say when tokens expire.** `LoginResponse` is only `{accessToken, refreshToken}`;
      the web UI proposal has the client decode the JWT `exp` to refresh early, and nothing tells it when the
      30-day session ends. Add `accessTokenExpiresIn` (seconds) and `refreshTokenExpiresAt` to the response.
      Adding fields is backward compatible for JSON clients. Test: login and refresh return both, the first
      equal to `app.jwt.expiration`. Update README section 1 and the web UI proposal's step 4.

## Needs you

- [ ] Old secrets from `docker_compose/.env` remain in git history. Rotate them before any real deployment.
- [ ] **Untracked files in the repo root.** `to_delete_just_spring_boot_note` (a psql dump of a session row, its
      name says delete), `.claude/` (the skills) and `docs/jobs/` (the nightly loop notes, marked Draft). Delete
      the note, and commit or ignore the other two.

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
