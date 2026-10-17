# CLAUDE.md

Spring Boot 4 expense tracker built to learn backend practices, mainly hand-rolled JWT auth
(access token + rotating refresh token). `README.md` explains the auth design in depth.

## Layout

- `backend/` — the Maven app (Java 17, Spring Boot 4.0.3, PostgreSQL, Flyway, JPA, Lombok, jjwt)
  - Packages by feature: `auth/`, `session/`, `user/`, `expense/`, plus `common/`, `config/`, `bootstrap/`
  - Migrations: `src/main/resources/db/migration/V*.sql` — never edit an applied migration, add a new one
- `frontend/` — React + Vite + TypeScript web UI (Node 24), features by folder under `src/`; nginx image serves it and proxies the API
- `docker_compose/` — Postgres + app via Docker Compose
- API requests (Bruno, with scripts) live in a separate repo, not here

## Build and test

Run from `backend`:

```sh
./mvnw test      # needs Docker running; starts a throwaway Postgres via Testcontainers
./mvnw package   # builds target/expense-tracker-1.0.jar
```

Frontend, from `frontend` (needs Node 24):

```sh
npm ci
npm test -- --run   # Vitest
npm run build       # tsc + vite build
npm run e2e         # optional: Playwright against a throwaway Compose stack, needs Docker
```

- Always use `./mvnw`. The system `mvn` is 3.5.0, too old for Spring Boot 4.
- Tests use the `test` profile, which skips the admin/JWT bootstrap runners.
- New integration tests: `@SpringBootTest` + `@Import(TestcontainersConfiguration.class)`.
- The test Postgres image (`postgres:18.3-bookworm`) must match `docker-compose.yml`.

## Running locally

- `docker_compose/.env` is git-ignored. Create it with `cp .env.example .env`.
- The app requires `ADMIN_PASSWORD` and `JWT_SECRET` (it refuses to start without them).
  `ADMIN_USERNAME` defaults to `admin`. `ADMIN_PASSWORD` must not be the `.env.example` placeholder
  `change-me` and is at most 72 bytes (at least 12 characters when the admin is first created).
  `JWT_SECRET` needs at least 256 bits (32 bytes) for HS256.
- `TRUSTED_PROXIES` (regex, default loopback only) names the reverse proxies whose `X-Forwarded-For` is
  trusted for the client IP; leave it empty when no proxy is in front.
- There is no default datasource. `run_project.sh` and `debug_project.sh` activate the `dev` profile
  (`application-dev.yml`: `devuser`/`devpwd` on localhost, see `run_postgres_container.sh`). To run
  without it, set `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`
  (Compose does) and leave the profile unset.

## Conventions

- One commit per fix, with a message explaining why.
- Work on a branch, then fast-forward merge into `master`.
- DTOs are records; entities and services use Lombok.

## Open work

Known issues and planned features are tracked in `docs/TODO.md`. Update it when one is done.
