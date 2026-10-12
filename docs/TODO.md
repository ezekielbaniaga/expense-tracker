# TODO

Last investigation: 2026-10-13 00:01 — 11 new findings

Findings from the project review on 2026-10-12, plus later investigations. Paths are relative to
`spring-boot-maven-sample/backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

Work items top to bottom, one per commit. When an item is fixed, move it to **Done** with its
commit hash. Items that need a human decision or action outside the code go in **Needs you**.

## Errors and validation

- [ ] **Amounts too large for the column give 500.** `expense.amount` is `NUMERIC(10,2)` but the DTOs have no
      `@Digits(integer = 8, fraction = 2)`. 123456789.00 fails in Postgres with "numeric field overflow"
      (500), and extra decimals are silently rounded. (`expense/dto/`)
- [ ] **404 body is plain text.** `handleNotFound` in `common/GlobalExceptionHandler.java` returns the bare
      message as `text/plain` (`EXPENSE_NOT_FOUND`), while every other error is an `ErrorResponse` JSON.

## API

- [ ] **`v`-prefixed API versions are rejected.** `config/DefaultApiVersionParser.java` uses
      `version.matches("^[vV]")`, but `String.matches` must match the whole string, so `v1.0` is never
      stripped. Verified: `X-API-Version: 1.0` gives 200, `v1.0`/`V1.0`/`v1` are rejected. The second `if` also
      has a redundant condition.

## Sessions

- [ ] **Sessions and used token hashes are never cleaned up.** Expired and revoked rows stay in
      `user_sessions` forever, and `used_refresh_tokens` gains a row on every refresh (about 96 a day per
      active client at 15-minute access tokens). Add a scheduled cleanup like `expense/job/ExpenseCleanup.java`
      (deleting old sessions cascades to their used hashes).

## Auth

- [ ] **A short `JWT_SECRET` passes the startup check but breaks every login.** `auth/service/JWTBootstrapService.java`
      only rejects a blank secret. HS256 needs at least 32 bytes, so `Keys.hmacShaKeyFor` throws
      `WeakKeyException` on the first login (500, shown as 401). Validate the length at startup. The
      `JWTProperties` javadoc also tells people to generate the secret on a third-party website; point to
      `openssl rand -base64 32` instead.

## Deployment

- [ ] **The app can start before Postgres is ready.** `docker_compose/docker-compose.yml` uses `depends_on`
      without a Postgres healthcheck and `condition: service_healthy`, so on a fresh `up` Flyway can fail to
      connect and the app only recovers via `restart: unless-stopped`.
- [ ] **The container runs as root.** `backend/Dockerfile` has no `USER`, so the JVM runs as root inside the
      container. Run as an unprivileged user.

## Tests

- [ ] **`/auth/login` has no tests.** Nothing covers a correct login (tokens returned, session row with user
      agent and IP), a wrong password, an unknown user, or a disabled user. All should be 401 except the first.

## Needs you

- [ ] Old secrets from `docker_compose/.env` remain in git history. Rotate them before any real deployment.
- [ ] **Decide on login brute-force protection.** `/auth/login` allows unlimited password attempts. Options:
      per-username/IP throttling in the app (in-memory, so per instance), a library like Bucket4j, or rate
      limiting at a reverse proxy. Which one depends on how you'll deploy.

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
