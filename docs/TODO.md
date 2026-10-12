# TODO

Findings from the project review on 2026-10-12. Paths are relative to
`spring-boot-maven-sample/backend/src/main/java/ezekiel/baniaga/springboot/maven/backend/`.

Work items top to bottom, one per commit. When an item is fixed, move it to **Done** with its
commit hash. Items that need a human decision or action outside the code go in **Needs you**.

## Refresh tokens and sessions

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

## Needs you

- [ ] Old secrets from `docker_compose/.env` remain in git history. Rotate them before any real deployment.

## Done

- [x] Compose passed `ADMIN_USER` but the app reads `ADMIN_USERNAME` (683ec2f)
- [x] `logging` was nested under `spring` in `application.yml`, so it was ignored (ef0a319)
- [x] `.env` with secrets was tracked; replaced with `.env.example` (3a188fd)
- [x] Context test needed a live local Postgres; now uses Testcontainers (8111665)
- [x] Refresh token reuse now revokes the whole session (5b27672)
- [x] Concurrent refreshes with the same token are serialized by a row lock; losers count as reuse (09c4ed0)
- [x] Refresh rotation returns `CustomUserDetails` mapped inside the transaction, not a lazy `User` (81eaf15)
