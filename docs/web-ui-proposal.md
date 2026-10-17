# Web UI Proposal

2026-10-13

## Context

The expense tracker is an API only. This proposal lists what is needed to put a browser UI in front of it, without changing the auth design.

- **Auth is body-based.** `POST /auth/login` returns `{ accessToken, refreshToken }` as JSON. `POST /auth/refresh` and `POST /auth/logout` take `{ refreshToken }` in the body. No cookies are involved. The access token lives 15 minutes (`app.jwt.expiration`), a refresh session 30 days.
- **Refresh tokens rotate and reuse is fatal.** Each refresh returns a new refresh token and the old one is recorded in `used_refresh_tokens`. Presenting an old one revokes the whole session, and concurrent refreshes with the same token count as reuse (row lock, losers are reuse). A UI that refreshes carelessly will log itself out.
- **Expenses are the only feature API.** `/api/expense` is scoped to the caller (`owner_id`); other users' rows return 404. Updates use optimistic locking through a `version` field.
- **Versioned by header.** `X-API-Version` selects `1.0` (default) or `1.1`. `1.1` adds `count` and `total_amount` to the list.
- **No CORS config, no static hosting, no user endpoints.** `SecurityConfig` has no `cors(...)`, `/auth/register` and `/users/**` are only proposed (`docs/user-endpoints-proposal.md`), and the app is not set up to serve a frontend.
- **Gap.** There is nothing a person can open in a browser. The Bruno collection is the only client.

## Goals and non-goals

The goal is a small, secure single-page app where a person logs in, manages their own expenses, and stays logged in across access-token expiry.

**Goals**

- Log in, log out, and stay signed in for the life of the refresh session.
- List, create, edit, and delete expenses, with the archived list and totals.
- Show the server's validation and conflict errors usefully.
- Run in Docker Compose next to Postgres and the app, with one `up` command.

**Non-goals (for now)**

- Mobile apps, offline mode, PWA install.
- Server-side rendering. This is an authenticated app with no SEO need.
- Charts and reports beyond the `total_amount` the API already returns.
- Admin screens, until the admin endpoints exist (see Milestones).

## Frontend stack options

| Option | For | Against |
| --- | --- | --- |
| **React + Vite + TypeScript** | Biggest ecosystem and hiring pool. Static build, so it ships as plain files. | Choices to make for routing, data fetching, and forms. |
| Vue 3 + Vite | Batteries closer to included (router, Pinia). | Smaller ecosystem for the data layer below. |
| Angular | Everything built in, strong typing. | Heavy for four screens. |
| Thymeleaf / HTMX in the Spring app | No second toolchain, same origin, no CORS. | Works against the JWT design: the app is stateless and token-based, so server-rendered pages would need cookies or sessions, defeating what the project is for. |
| Next.js | File routing, SSR. | A Node server in production for no gain; tokens in the browser either way. |

**Recommendation: React + Vite + TypeScript**, with:

- React Router for routes and a route guard.
- TanStack Query for fetching, caching, and invalidation.
- react-hook-form + zod for forms and client validation.
- A hand-written `fetch` wrapper (not Axios). The wrapper is where refresh rotation lives, and it is small enough to own, in the spirit of the hand-rolled auth.
- Plain CSS modules or Tailwind; no component library at first.

Put the app in `frontend/`, next to `backend/` and `docker_compose/`.

## Pages and screens

| Screen | Route | Access |
| --- | --- | --- |
| Login | `/login` | Public |
| Expense list | `/` | Logged in |
| Expense create | `/expenses/new` (or a modal on the list) | Logged in |
| Expense detail / edit | `/expenses/:id` | Logged in |
| Archived expenses | `/archived` | Logged in |
| Not found / error | `*` | Any |
| Register | `/register` | Public (needs `POST /auth/register`) |
| Profile, change password | `/me` | Logged in (needs `/users/me`) |
| Users admin | `/admin/users` | `ADMIN` (needs `/users`) |

The last three depend on the user endpoints and are separate milestones. The first six work against the API as it is today.

What each screen shows:

- **List:** description, amount, and the total and count in the header (`1.1`). A "new" button and a link to archived. Rows link to the detail page.
- **Create / edit:** `description`, `amount`, `category` (a select filled from the categories endpoint), `date`. Edit also carries the hidden `version`.
- **Detail:** all fields from `ExpenseResponse`, including `createdAt` and `lastModified`, with edit and delete.
- **Archived:** read-only list with `archivedAt`. There is no restore endpoint, so no restore button.

## API endpoints each screen uses

| Screen | Calls |
| --- | --- |
| Login | `POST /auth/login` |
| App shell (every page) | `POST /auth/refresh` on boot and on 401; `POST /auth/logout` from the menu |
| Expense list | `GET /api/expense` with `X-API-Version: 1.1` |
| Create | `GET /api/expense/categories`, `POST /api/expense` |
| Detail / edit | `GET /api/expense/{id}`, `PUT /api/expense/{id}`, `PATCH /api/expense/{id}/description`, `DELETE /api/expense/{id}?version=` |
| Archived | `GET /api/expense/archived` |
| Register (later) | `POST /auth/register` |
| Profile (later) | `GET /users/me`, `POST /users/me/password` |
| Users admin (later) | `GET /users`, `GET /users/{id}`, `PATCH /users/{id}` |

Things the UI has to work around in the current API:

- **List rows are thin.** `ExpenseListItemResponse` has only `id`, `description`, `amount`. Category, date, and `version` need `GET /{id}`. Fine for a first version; if the list needs a category or date column, add fields to the list item (a backend change, see below).
- **No pagination, filtering, or sorting.** The list returns everything the user owns. Sort and filter in the browser at first and add `?page=` / `?category=` to the API when a list gets long.
- **Mixed naming.** `supported_categories`, `total_amount`, and `archivedAt` are snake_case or camelCase depending on the DTO. The client maps them in one `api/expense.ts` module so the rest of the code sees one style.
- **Send `X-API-Version` explicitly** on list calls so a later default change does not move the UI. Use `1.1` for the list; `POST` and `/categories` accept `1.0+`.
- **Generate the client types by hand** from the DTOs at first (about ten records). If the API grows, add springdoc-openapi to the backend and generate types from it.

## Auth flow

**Token storage.** The access token is held in memory only (a module variable behind the auth context). The refresh token has to survive a page reload, or every F5 is a login.

| Option | For | Against |
| --- | --- | --- |
| Refresh token in `localStorage` | Simple, survives reload and new tabs, works with the current body-based API. | Readable by any script on the page, so an XSS bug leaks a 30-day credential. |
| Refresh token in `sessionStorage` | Cleared when the tab closes, smaller window. | Lost on new tab or browser restart; each tab is its own login. |
| **`HttpOnly` cookie, set by the backend** | Not readable by scripts. The best protection against XSS theft. | Backend change: `/auth/*` must set and read the cookie, and CSRF now matters for it. Needs same origin (see CORS below). |

**Recommendation:** ship v1 with `localStorage` plus a strict Content-Security-Policy and no third-party scripts, and decide on the cookie move in the Open questions. The reuse detection already limits what a stolen token is worth: the first party to rotate wins and the other is revoked. Do not put the access token in storage at all.

**Boot.** On load, if a refresh token exists, call `/auth/refresh` before rendering protected routes (show a splash). Success stores the new pair; a 401 clears everything and goes to `/login`.

**Requests.** The `fetch` wrapper adds `Authorization: Bearer <access>`. On a 401 it refreshes once, then replays the original request once. A second 401 means logged out.

**Refresh rotation, the careful part.** Because reuse revokes the session, refresh must be single-flight:

1. **One in-flight refresh per tab.** Keep a shared promise. Ten parallel requests that all get a 401 await the same refresh instead of sending ten.
2. **One refresh across tabs.** Two tabs sharing a `localStorage` refresh token will race. Wrap refresh in the Web Locks API (`navigator.locks.request('refresh', ...)`), and inside the lock re-read the stored refresh token first: if another tab already rotated it, use the new access token path instead of sending the old one. Fall back to a `storage`-event handshake where Web Locks is missing.
3. **Write the new token before anything else.** Save the returned refresh token to storage immediately, before touching state, so a reload mid-refresh does not resend the old one.
4. **Refresh ahead of expiry.** Login and refresh return `accessTokenExpiresIn` (seconds); schedule the next refresh about 60 seconds before it runs out, so most requests never see a 401. No need to decode the JWT. They also return `refreshTokenExpiresAt` (UTC without offset, the session's fixed end; refresh does not move it), so the UI can warn before the 30-day session ends.
5. **Never retry a failed refresh blindly.** A network error leaves the old token valid (unless the server did rotate and the response was lost; that case ends as reuse and a login, which is acceptable and rare). A 401 is final.

**Logout.** Call `POST /auth/logout` with the refresh token, then clear storage, memory, and the Query cache whether or not the call succeeded. Logout is "always 204", and the access token stays valid until it expires, so clearing the client is what matters. Broadcast the logout to other tabs through a `storage` event so they leave too.

**Revoked or disabled.** A refresh 401 at any time (revoked, expired, reuse detected, user disabled) sends the person to `/login` with a short "you were signed out" message and the page they came from.

**Roles.** The role is in the access token's `role` claim. The UI may read it to show or hide admin links, but the server is the authority; hiding a link is not security.

## CORS and backend changes

The cleanest answer is to avoid CORS: serve the UI and the API from one origin through a reverse proxy (see Build and deploy). In development, use the Vite dev-server proxy for the same effect. Then the backend needs no CORS config for the common path.

Backend changes, in order of need:

| Change | Why | Needed for |
| --- | --- | --- |
| Nothing | Same-origin proxy in dev and in Compose. | The whole first milestone |
| `CorsConfigurationSource` bean + `.cors(...)` in `SecurityConfig` | Needed only if the UI is ever served from another origin. Allow the UI origin from a property (`app.cors.allowed-origins`), methods `GET, POST, PUT, PATCH, DELETE`, headers `Authorization, Content-Type, X-API-Version`, no credentials. Never `*` with credentials. | Separate-origin deploys, or running Vite without its proxy |
| JSON body for 401 and 403 | `authenticationEntryPoint` and `accessDeniedHandler` use `sendError`, so the body is the container's, not `ErrorResponse`. The UI can branch on the status code, but a JSON body keeps one error path. | Nice to have |
| Cookie-based refresh (`Set-Cookie` on login/refresh, read on refresh/logout) | Only if the cookie option is chosen. `HttpOnly; Secure; SameSite=Strict; Path=/auth`. | Optional |
| Extra fields on the list item (`category`, `date`, `version`) | One call renders the whole table. Needs a new API version rather than changing `1.0`/`1.1`. | Optional |
| `/auth/register`, `/users/**` | Already proposed in `docs/user-endpoints-proposal.md`. | Register, profile, and admin screens |
| Login throttling | Open item in `docs/TODO.md`. A public form makes it more urgent. | Before any real deployment |

Notes:

- `X-API-Version` and `Authorization` are not CORS-safelisted headers, so a cross-origin call triggers a preflight. Another reason to prefer same origin.
- `POST /auth/login` and `/auth/refresh` record `User-Agent` and the remote address. Behind a proxy the address is the proxy's unless `server.forward-headers-strategy` is set, so set it (and forward `X-Forwarded-For`) in the proxy config.
- No backend code changes are needed to start; the first milestone runs against the API as it is.

## State and data fetching

- **Server state in TanStack Query.** Keys: `['expenses']`, `['expense', id]`, `['categories']`, `['archived']`. The list query uses `X-API-Version: 1.1`.
- **Mutations invalidate.** Create, update, patch, and delete invalidate `['expenses']` (and `['archived']` after delete); update and patch also set `['expense', id]` from the response, which carries the new `version`.
- **Categories are static.** Fetch once, `staleTime: Infinity`.
- **Auth state in a small context.** `{ status: 'booting' | 'anonymous' | 'authenticated', role, username }`. The access token itself stays out of React state, in the module that the `fetch` wrapper owns, so a refresh does not re-render the tree.
- **Clear the Query cache on logout and on login.** Otherwise a second person on the same browser briefly sees the first person's list.
- **Optimistic updates: not at first.** The `version` field makes them awkward (the server value changes). Show a pending state and wait for the response.
- **Amounts are decimal strings.** Parse with a decimal-safe approach, not floating-point arithmetic. Display with `Intl.NumberFormat`; do totals from the server's `total_amount`, not by summing in the browser.
- **Dates are `LocalDate` / `LocalDateTime` without a zone.** Treat `date` as a plain `YYYY-MM-DD` string. Do not round-trip it through `new Date()`, which shifts it by the local offset.

## Validation and error handling

**Client validation mirrors the DTOs** so most mistakes never reach the server, but the server stays the authority:

| Field | Rule |
| --- | --- |
| `description` | Required, not blank, max 250 characters |
| `amount` | Required, greater than 0, at most 8 integer digits and 2 decimals |
| `category` | Required, one of the categories endpoint |
| `date` | Required, today or earlier |
| `version` | Hidden field copied from the loaded expense |
| Login `username`, `password` | Required, not blank |

**Server errors share one shape**, `ErrorResponse { code, messages[], timestamp }`. Parse it in the wrapper into a typed `ApiError { status, code, messages }`.

| Status / code | UI behavior |
| --- | --- |
| 400 `VALIDATION_ERROR` | Messages come as `field: message`. Split on the first colon and attach to the matching form field; show the rest as a form-level error. |
| 401 | Refresh and retry once, then log out (see Auth flow). On `/auth/login`, show "invalid username or password" and nothing more specific. |
| 403 | "You don't have access to this." |
| 404 | "Not found". The API returns 404 for other users' expenses too, so do not hint that it exists elsewhere. |
| 409 `CONCURRENT_MODIFICATION` or a business-rule code | The record changed under the person. Offer "Reload" which refetches and keeps the person's unsaved text visible so it can be re-applied. Archived expenses also return 409 on edit; show them read-only. |
| 5xx / network | Toast "Something went wrong, try again", keep form input, and a retry button. Queries retry with backoff; mutations do not retry automatically. |

Also: disable submit while pending to avoid double posts, wrap the app in an error boundary, and never print tokens or request bodies to the console.

## Testing

| Layer | Tool | What it covers |
| --- | --- | --- |
| Unit | Vitest | Amount and date helpers, error parsing, the `fetch` wrapper's refresh logic |
| Component | Vitest + Testing Library + MSW | Forms and screens against a mocked API, including server error shapes |
| End to end | Playwright | Real browser against the Compose stack |
| Backend contract | Existing `./mvnw test` | Keeps the API the UI relies on honest |

Cases that matter most (they are where this design can fail):

- **Single-flight refresh.** Ten parallel requests with an expired token send exactly one `/auth/refresh`.
- **Rotation persistence.** After a refresh, storage holds the new refresh token; a reload uses it and stays logged in.
- **Two tabs.** Two Playwright pages sharing a context refresh at the same moment; both stay logged in and the server sees no reuse.
- **Reuse path.** A 401 from refresh lands on `/login` and clears the cache.
- **Logout.** Calls the endpoint, clears storage, and the second tab also leaves.
- **Conflicts.** Edit in two tabs; the second save shows the reload prompt.
- **Cross-user isolation.** Needs two accounts (so after register or seeded users); the second user gets "Not found".

The end-to-end suite needs seeded credentials. Reuse the `test` profile pattern: the Compose test stack runs with a known `ADMIN_PASSWORD` and `JWT_SECRET`. Keep it a separate Compose file or `profiles:` entry so it never touches the dev database volume.

Run frontend unit and component tests in CI on every push; run Playwright against Compose on pull requests to `master`.

## Build, deploy, and Docker Compose integration

**Local development.** `npm run dev` on Vite (port 5173) with a proxy for `/api` and `/auth` to `http://localhost:8080`. The browser sees one origin, so no CORS config. The backend runs the usual way (`./mvnw spring-boot:run` or Compose).

**Production-like build.** `npm run build` outputs static files in `dist/`.

**Image.** A multi-stage `frontend/Dockerfile`:

1. `node:<lts>` stage: `npm ci`, `npm run build`.
2. `nginx` (unprivileged variant, matching the repo's non-root rule for the app container) stage: copy `dist/` and an `nginx.conf`.

**`nginx.conf`.**

- `location /` serves the files with `try_files $uri /index.html` for client-side routes.
- `location /api/` and `location /auth/` proxy to `http://app:8080`, passing `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, and the `Authorization` and `X-API-Version` headers (the defaults pass them through).
- Cache `assets/*` (hashed filenames) for a long time; never cache `index.html`.
- Send security headers: `Content-Security-Policy` (`default-src 'self'`, no inline scripts), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `frame-ancestors 'none'`.
- Add HSTS only where the site is behind real TLS.

**Compose.** Add a `web` service to `docker_compose/docker-compose.yml` on `app-network`:

```yaml
  web:
    image: expense-tracker-web:1.0
    container_name: spring-web
    restart: unless-stopped
    ports:
      - "8081:8080"
    depends_on:
      - app
    networks:
      - app-network
```

- Add a `build_frontend_image.sh` beside `backend/build_docker_image.sh`, tagging `expense-tracker-web:1.0`, and call it from `run_compose.sh`.
- Keep the app's `8080` port published for Bruno and debugging, or drop it once the UI is the main client; the `web` service reaches the app over the internal network either way.
- TLS: terminate at a real reverse proxy (Caddy, Traefik, or nginx with certificates) when this leaves a laptop. The `Secure` cookie and HSTS options depend on it.
- Update `docker_compose/README.md` and the repo `README.md` with the new service and ports, and add `frontend/` build output to `.gitignore`.

## Milestones

Ordered so each step is usable and testable on its own. Per repo convention, one commit per change, on a branch, fast-forwarded into `master`.

1. **Scaffold and auth shell.** Vite + React + TS app, router, `fetch` wrapper, auth context, login page, protected-route guard, Vite proxy. Done when: log in against the local backend and see an empty shell; logout works.
2. **Rotation done right.** Single-flight and cross-tab refresh, boot refresh, early refresh, 401 replay, cross-tab logout. Tests for each case in Testing. This is the riskiest piece, so do it before features.
3. **Expense read screens.** List (`1.1`), detail, archived, error and empty states.
4. **Expense write screens.** Create, edit, patch description, delete with `version`, validation and 409 handling.
5. **Docker and Compose.** Frontend image, nginx config with proxy and headers, `web` service, scripts and READMEs.
6. **Tests in CI.** Vitest + MSW in CI; Playwright against Compose.
7. **Polish.** Accessibility pass (labels, focus, keyboard), responsive layout, loading skeletons.
8. **Registration and profile.** After `/auth/register` and `/users/me` ship (milestones 2 and 3 of the user proposal). Register page, profile, change password (sessions end, so log out and go to login).
9. **Admin screens.** After the admin endpoints ship. Users table, disable and re-role, with the self-demotion and last-admin errors shown clearly.
10. **Optional hardening.** Cookie-based refresh token, `springdoc-openapi` generated client types, list pagination and filters, login throttling UI.

Milestones 1 to 5 need no backend change. Update `README.md`, add the frontend to `CLAUDE.md` (build and test commands), and record the work in `docs/TODO.md` as it lands.

## Open questions

- [ ] **Where does the refresh token live?** `localStorage` now with a strict CSP, or move to an `HttpOnly` cookie before launch? The cookie is stronger against XSS but adds backend work and CSRF handling. Depends on whether this ever leaves a laptop.
- [ ] **Single origin or two?** The plan assumes a reverse proxy and one origin. If you want the UI on a separate host (a static host or CDN), CORS and the cookie options change.
- [ ] **React, or something you want to learn?** The recommendation is the safe default. Vue or Svelte would work equally well with the same API.
- [ ] **Should the list API grow?** Thin rows force a detail call per row or a client-side wait. Add fields and pagination now, or live with it until it hurts?
- [ ] **Do the user endpoints come first?** The UI is only useful for one account (the admin) until `/auth/register` exists. Build milestones 1 to 4 now, or wait?
- [ ] **Login throttling.** The existing "Needs you" item. A public login form raises its priority.
- [ ] **Where do e2e tests run?** CI, and is Docker available there?
- [ ] **UI scope for categories.** The category list is a fixed enum on the server. Is it staying fixed, or will users add their own? That changes the create form.
