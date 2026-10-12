# TODO

Findings from the project review on 2026-10-12. Paths are relative to
`spring-boot-maven-sample/backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

## Refresh tokens and sessions

- [x] **Refresh token reuse detection.** Presenting an already-rotated token just returns 401.
      It should be treated as theft and revoke the whole session, so a stolen token can't keep
      a session alive. (`session/UserSessionService.java`, `rotateRefreshToken`) (5b27672)
- [ ] **Concurrent refresh race.** `rotateRefreshToken` is not `@Transactional` and `UserSession`
      has no `@Version`, so two refreshes with the same token can both succeed (last write wins).
      Careful: if the method becomes `@Transactional`, throwing `RefreshTokenReuseException` would
      roll back the session revoke. Revoke in its own transaction (`REQUIRES_NEW`) or use
      `noRollbackFor`, and keep `RefreshTokenReuseTests` passing.
- [ ] **Lazy `User` used outside the service.** `rotateRefreshToken` returns a lazy `User` proxy that
      `AuthController` reads later. It only works because `spring.jpa.open-in-view` is on by default.
      Map to `CustomUserDetails` inside a transaction instead.
- [ ] **Disabled users can still refresh.** Refresh doesn't check `user.enabled`, so a disabled user
      keeps getting access tokens for up to 30 days.
- [ ] **Logout endpoint.** `revoked_at` exists and the README diagram shows logout, but no endpoint sets it.

## Expenses

- [ ] **Expenses aren't scoped per user.** The `expense` table has no `user_id`, so every logged-in user
      sees and edits all expenses. Needs a migration plus filtering by the authenticated user.
- [ ] **`deleteExpense` is inconsistent with update/patch.** It isn't `@Transactional`, skips the version
      check, and can archive an already-archived expense. (`expense/ExpenseService.java`)

## Build

- [ ] **`spring-boot-starter-flyway-test` has no `test` scope** in `pom.xml`, so test libraries ship in the
      production jar.

## Minor

- [ ] `JWTAuthenticationFilter` parses each token twice (`isTokenValid`, then `extractPrincipal`), and
      `JWTService` rebuilds the signing key on every call.
- [ ] Old secrets from `docker_compose/.env` remain in git history. Rotate them before any real deployment.

## Done

- [x] Compose passed `ADMIN_USER` but the app reads `ADMIN_USERNAME` (683ec2f)
- [x] `logging` was nested under `spring` in `application.yml`, so it was ignored (ef0a319)
- [x] `.env` with secrets was tracked; replaced with `.env.example` (3a188fd)
- [x] Context test needed a live local Postgres; now uses Testcontainers (8111665)
