# Expense Tracker web UI

React + Vite + TypeScript single-page app for the Expense Tracker API in `../backend`.
This page covers running it in development mode. The production setup (nginx image, Docker Compose)
is described in [`../docker_compose/README.md`](../docker_compose/README.md).

## What you need

- Node 24 or later (`.nvmrc` says `24`; with nvm, run `nvm use`)
- Java 17 or later and Docker, for the backend and its Postgres

## Run it in development mode

The Vite dev server serves the UI on <http://localhost:5173> and proxies `/api`, `/auth` and `/users`
to the backend on <http://localhost:8080>, so you need the backend running first.

### 1. Start Postgres

From `backend`:

```sh
./run_postgres_container.sh
```

This starts a `dev-postgres-db` container (user `devuser`, password `devpwd`, database `appdb`,
port 5432) and then follows its logs. Press Ctrl+C to stop following; the container keeps running.
Use another terminal for the next steps.

### 2. Start the backend

The app refuses to start without two secrets. Pick values for local use:

```sh
export ADMIN_PASSWORD='choose-a-long-password'   # 12 to 72 bytes, not "change-me"
export JWT_SECRET="$(openssl rand -base64 48)"   # at least 32 bytes
```

Then, from `backend`:

```sh
./mvnw package -DskipTests   # builds target/expense-tracker-1.0.jar
./run_project.sh             # runs it with the dev profile against the Postgres above
```

Flyway creates the schema on the first start, and the app creates the admin user (`admin` unless you
set `ADMIN_USERNAME`) with your `ADMIN_PASSWORD`. Wait for the log line saying the app has started;
`http://localhost:8080/actuator/health` answers `{"status":"UP"}` when it is ready.

### 3. Start the UI

From `frontend`:

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. Sign in as `admin` with your `ADMIN_PASSWORD`, or use "Create an account"
to register a normal user. Edits to files in `src/` reload in the browser without a restart.

## Things to know

- **Use `localhost`, not `127.0.0.1`.** The backend checks the `Origin` header when the refresh cookie
  is used, and it only allows `http://localhost:5173` (and `http://localhost:8081` for the Compose
  setup). The proxy in `vite.config.ts` deliberately leaves the `Origin` header alone, and a different
  host or port makes refresh and logout fail with 403 `ORIGIN_NOT_ALLOWED`.
- **The access token lives in memory.** Reloading the page signs you in again through the refresh
  cookie, which is how it is meant to work. A token lasts 15 minutes and the UI refreshes it by itself.
- **Backend on another port?** Change `backend.target` in `vite.config.ts`.
- **A clean database:** `docker rm -f dev-postgres-db && docker volume rm pgdata_dev` removes the
  development data. Only do this if you do not need what is in it.

## Other commands

Run from `frontend`:

| Command | What it does |
| --- | --- |
| `npm test` | Vitest in watch mode (use `npm test -- --run` for a single run) |
| `npm run build` | Type-check with `tsc`, then build to `dist/` |
| `npm run lint` | Type-check only |
| `npm run e2e` | Playwright suite against a throwaway Compose stack, see below |

The unit tests mock the API with MSW, so they need neither the backend nor Docker.

### End-to-end tests

`npm run e2e` runs `run_e2e.sh`: it builds the backend and web images, starts a separate Compose project
(`expense-tracker-e2e`, UI on <http://localhost:18081>) and runs the Playwright specs in `e2e/`
against it. It needs Docker. It first installs the Chromium build Playwright expects, which downloads
it on the first run and after a Playwright upgrade and does nothing otherwise.

It uses its own containers, volume and ports, so it can run next to the development setup above.

## Layout

```
src/
  api/        fetch client (token refresh, cross-tab lock), error mapping, API modules
  auth/       login, register, auth context and route guards
  expenses/   list, archived, detail, create and edit screens
  profile/    account page, password change and signed-in devices
  admin/      user management (admins only)
  ui/         layout, toasts, shared focus and form helpers
e2e/          Playwright specs
```
