# CLAUDE.md

Spring Boot 4 expense tracker built to learn backend practices, mainly hand-rolled JWT auth
(access token + rotating refresh token). `README.md` explains the auth design in depth.

## Layout

- `spring-boot-maven-sample/backend/` — the Maven app (Java 17, Spring Boot 4.0.3, PostgreSQL, Flyway, JPA, Lombok, jjwt)
  - Packages by feature: `auth/`, `session/`, `user/`, `expense/`, plus `common/`, `config/`, `bootstrap/`
  - Migrations: `src/main/resources/db/migration/V*.sql` — never edit an applied migration, add a new one
- `spring-boot-maven-sample/docker_compose/` — Postgres + app via Docker Compose
- `spring-boot-maven-sample/*.yml` — Bruno API request collection

## Build and test

Run from `spring-boot-maven-sample/backend`:

```sh
./mvnw test      # needs Docker running; starts a throwaway Postgres via Testcontainers
./mvnw package   # builds target/backend-1.0.jar
```

- Always use `./mvnw`. The system `mvn` is 3.5.0, too old for Spring Boot 4.
- Tests use the `test` profile, which skips the admin/JWT bootstrap runners.
- New integration tests: `@SpringBootTest` + `@Import(TestcontainersConfiguration.class)`.
- The test Postgres image (`postgres:18.3-bookworm`) must match `docker-compose.yml`.

## Running locally

- `docker_compose/.env` is git-ignored. Create it with `cp .env.example .env`.
- The app requires `ADMIN_PASSWORD` and `JWT_SECRET` (it refuses to start without them).
  `ADMIN_USERNAME` defaults to `admin`.

## Conventions

- One commit per fix, with a message explaining why.
- Work on a branch, then fast-forward merge into `master`.
- DTOs are records; entities and services use Lombok.

## Open work

Known issues and planned features are tracked in `docs/TODO.md`. Update it when one is done.
