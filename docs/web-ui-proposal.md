# Web UI Proposal

2026-10-13

Status: queued in docs/TODO.md (2026-10-18)

## Context

The expense tracker is an API only. This proposal lists what is needed to put a browser UI in front of it, without changing the auth design.

- **Auth is body-based.** `POST /auth/login` returns `{ accessToken, refreshToken }` as JSON. `POST /auth/refresh` and `POST /auth/logout` take `{ refreshToken }` in the body. No cookies are involved. The access token lives 15 minutes (`app.jwt.expiration`), a refresh session 30 days.
- **Refresh tokens rotate and reuse is fatal.** Each refresh returns a new refresh token and the old one is recorded in `used_refresh_tokens`. Presenting an old one revokes the whole session, and concurrent refreshes with the same token count as reuse (row lock, losers are reuse). A UI that refreshes carelessly will log itself out.
- **Expenses are the only feature API.** `/api/expense` is scoped to the caller (`owner_id`); other users' rows return 404. Updates use optimistic locking through a `version` field.
- **Versioned by header.** `X-API-Version` selects `1.0` (default) or `1.1`. The `1.0` list returns `{expenses, total}`, where `total` is a count; `1.1` renames it to `count` and adds `total_amount`.
- **No CORS config, no static hosting.** `SecurityConfig` has no `cors(...)` and the app is not set up to serve a frontend. The user endpoints exist: `/auth/register`, `/users/me` (with password change and sessions) and the admin `/users/**`.
- **Rate limited.** Login, register, refresh, logout and password change return 429 `TOO_MANY_REQUESTS` with `Retry-After` over their limits. Limits are per client IP (and per username for failed logins), so behind a proxy the client IP must come from a trusted `X-Forwarded-For` (`TRUSTED_PROXIES`).
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

The last three use the user endpoints, which already exist; they come after the expense screens.

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

- **List rows are thin.** `ExpenseListItemResponse` has only `id`, `description`, `amount`, and the list has no `ORDER BY`. Decided: a new `X-API-Version: 1.2` list adds `category`, `date` and `version`, ordered by date; `1.0` and `1.1` stay as they are.
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

**Decided:** the `HttpOnly` cookie, plus a strict Content-Security-Policy from nginx. Login opts in with `X-Refresh-Token-Transport: cookie`; refresh and logout read the cookie when the body has no token, and require an allowed `Origin` (CSRF protection is off). The body-based flow stays for Bruno and the tests. Do not put the access token in storage at all.

**Boot.** On load, call `/auth/refresh` once before rendering protected routes (show a splash); scripts cannot see the cookie, so always try. Success keeps the new access token in memory; a 401 shows `/login`.

**Requests.** The `fetch` wrapper adds `Authorization: Bearer <access>`. On a 401 it refreshes once, then replays the original request once. A second 401 means logged out.

**Refresh rotation, the careful part.** Because reuse revokes the session, refresh must be single-flight:

1. **One in-flight refresh per tab.** Keep a shared promise. Ten parallel requests that all get a 401 await the same refresh instead of sending ten.
2. **One refresh across tabs.** All tabs share the cookie, so two tabs refreshing at once would race. Decided: wrap refresh in the Web Locks API (`navigator.locks.request('refresh', ...)`), so refreshes run one at a time and each sends the latest cookie. No `storage`-event fallback.
3. **The browser stores the new token.** The rotated cookie arrives with the refresh response, so a reload mid-refresh cannot resend the old one from script state.
4. **Refresh ahead of expiry.** Login and refresh return `accessTokenExpiresIn` (seconds); schedule the next refresh about 60 seconds before it runs out, so most requests never see a 401. No need to decode the JWT. They also return `refreshTokenExpiresAt` (UTC without offset, the session's fixed end; refresh does not move it), so the UI can warn before the 30-day session ends.
5. **Never retry a failed refresh blindly.** A network error leaves the old token valid (unless the server did rotate and the response was lost; that case ends as reuse and a login, which is acceptable and rare). A 401 is final.

**Logout.** Call `POST /auth/logout` (the cookie identifies the session, and the response clears it), then clear memory and the Query cache whether or not the call succeeded. Logout is 204 except for 429 and a malformed token (400), and the access token stays valid until it expires, so clearing the client is what matters. Broadcast the logout to other tabs through a `BroadcastChannel` so they leave too.

**Revoked or disabled.** A refresh 401 at any time (revoked, expired, reuse detected, user disabled) sends the person to `/login` with a short "you were signed out" message and the page they came from.

**Roles.** The role is in the access token's `role` claim. The UI may read it to show or hide admin links, but the server is the authority; hiding a link is not security.

## CORS and backend changes

The cleanest answer is to avoid CORS: serve the UI and the API from one origin through a reverse proxy (see Build and deploy). In development, use the Vite dev-server proxy for the same effect. Then the backend needs no CORS config for the common path.

Backend changes, in order of need:

| Change | Why | Needed for |
| --- | --- | --- |
| Nothing | Same-origin proxy in dev and in Compose. | The whole first milestone |
| `CorsConfigurationSource` bean + `.cors(...)` in `SecurityConfig` | Needed only if the UI is ever served from another origin. Allow the UI origin from a property (`app.cors.allowed-origins`), methods `GET, POST, PUT, PATCH, DELETE`, headers `Authorization, Content-Type, X-API-Version`, no credentials. Never `*` with credentials. | Separate-origin deploys, or running Vite without its proxy |
| Cookie-based refresh (`Set-Cookie` on login/refresh, read on refresh/logout) | Decided. `HttpOnly; Secure; SameSite=Strict; Path=/auth`, plus an `Origin` allow-list. | Before the frontend auth work |
| Extra fields on the list item (`category`, `date`, `version`) | Decided: `X-API-Version: 1.2`. One call renders the whole table. | The list screen |

Notes:

- `X-API-Version` and `Authorization` are not CORS-safelisted headers, so a cross-origin call triggers a preflight. Another reason to prefer same origin.
- `POST /auth/login` records `User-Agent` and the remote address, and every rate limit keys on the remote address. `server.forward-headers-strategy: native` is set, but only proxies matching `TRUSTED_PROXIES` are believed. Decided: the nginx container gets a fixed IP on `app-network`, and `TRUSTED_PROXIES` names only that IP. Without it every user shares nginx's IP and its rate limits.

## State and data fetching

- **Server state in TanStack Query.** Keys: `['expenses']`, `['expense', id]`, `['categories']`, `['archived']`. The list query uses `X-API-Version: 1.1`.
- **Mutations invalidate.** Create, update, patch, and delete invalidate `['expenses']` (and `['archived']` after delete); update and patch also set `['expense', id]` from the response, which carries the new `version`.
- **Categories are static.** Fetch once, `staleTime: Infinity`.
- **Auth state in a small context.** `{ status: 'booting' | 'anonymous' | 'authenticated', role, username }`. The access token itself stays out of React state, in the module that the `fetch` wrapper owns, so a refresh does not re-render the tree.
- **Clear the Query cache on logout and on login.** Otherwise a second person on the same browser briefly sees the first person's list.
- **Optimistic updates: not at first.** The `version` field makes them awkward (the server value changes). Show a pending state and wait for the response.
- **Amounts are JSON numbers** (`12.50` arrives as `12.5`). Decided: keep them as numbers, display with 2 decimals (`Intl.NumberFormat`), and take totals from the server's `total_amount`, never by summing in the browser. Values up to 8+2 digits are exact enough in a double for display.
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
| 409 `CONCURRENT_MODIFICATION` or a business-rule code | The record changed under the person. Offer "Reload" which refetches and keeps the person's unsaved text visible so it can be re-applied. `GET /{id}` returns 404 for archived expenses, so 409 `MODIFY_ARCHIVED` only happens when another tab deleted it; say so and go to the list. |
| 429 `TOO_MANY_REQUESTS` | Show "try again in N seconds" from `Retry-After`. A 429 from `/auth/refresh` does not sign the person out. |
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
- **Rotation persistence.** After a refresh, the browser holds the rotated cookie; a reload uses it and stays logged in.
- **Two tabs.** Two Playwright pages sharing a context refresh at the same moment; both stay logged in and the server sees no reuse.
- **Reuse path.** A 401 from refresh lands on `/login` and clears the cache.
- **Logout.** Calls the endpoint, the cookie is cleared, and the second tab also leaves.
- **Conflicts.** Edit in two tabs; the second save shows the reload prompt.
- **Cross-user isolation.** Needs two accounts (so after register or seeded users); the second user gets "Not found".

The end-to-end suite needs seeded credentials. Decided: a separate `docker-compose.e2e.yml` with its own project and volume, a known `ADMIN_PASSWORD` and `JWT_SECRET`, a short access-token lifetime and raised rate limits. It runs the normal profile, because the `test` profile skips the admin bootstrap.

Decided: run everything locally for now (`frontend/run_e2e.sh`); no CI yet.

## Build, deploy, and Docker Compose integration

**Local development.** Node 22. `npm run dev` on Vite (port 5173) with a proxy for `/api`, `/auth` and `/users` to `http://localhost:8080`. The browser sees one origin, so no CORS config. The backend runs the usual way (`./mvnw spring-boot:run` or Compose).

**Production-like build.** `npm run build` outputs static files in `dist/`.

**Image.** A multi-stage `frontend/Dockerfile`:

1. `node:<lts>` stage: `npm ci`, `npm run build`.
2. `nginx` (unprivileged variant, matching the repo's non-root rule for the app container) stage: copy `dist/` and an `nginx.conf`.

**`nginx.conf`.**

- `location /` serves the files with `try_files $uri /index.html` for client-side routes.
- `location /api/`, `location /auth/` and `location /users` proxy to `http://app:8080`, passing `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, and the `Authorization` and `X-API-Version` headers (the defaults pass them through).
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

- Add `frontend/build_docker_image.sh`, tagging `expense-tracker-web:1.0`. `run_compose.sh` builds no images today; make it call both build scripts.
- Decided: keep the app's `8080` port, bound to `127.0.0.1`, for Bruno and debugging; the `web` service reaches the app over the internal network.
- TLS: terminate at a real reverse proxy (Caddy, Traefik, or nginx with certificates) when this leaves a laptop. The `Secure` cookie and HSTS options depend on it.
- Update `docker_compose/README.md` and the repo `README.md` with the new service and ports, and add a `frontend/.gitignore` for `node_modules/` and `dist/`.

## Milestones

Ordered so each step is usable and testable on its own. Per repo convention, one commit per change, on a branch, fast-forwarded into `master`.

1. **Scaffold and auth shell.** Vite + React + TS app, router, `fetch` wrapper, auth context, login page, protected-route guard, Vite proxy. Done when: log in against the local backend and see an empty shell; logout works.
2. **Rotation done right.** Single-flight and cross-tab refresh, boot refresh, early refresh, 401 replay, cross-tab logout. Tests for each case in Testing. This is the riskiest piece, so do it before features.
3. **Expense read screens.** List (`1.1`), detail, archived, error and empty states.
4. **Expense write screens.** Create, edit, patch description, delete with `version`, validation and 409 handling.
5. **Docker and Compose.** Frontend image, nginx config with proxy and headers, `web` service, scripts and READMEs.
6. **End-to-end tests.** Playwright against an e2e Compose stack, run locally.
7. **Polish.** Accessibility pass (labels, focus, keyboard), responsive layout, loading skeletons.
8. **Registration and profile.** Register page, profile, change password (sessions end, so log out and go to login), and a list of your sessions with revoke.
9. **Admin screens.** Users table, disable and re-role, with the self-demotion and last-admin errors shown clearly.
10. **Optional hardening.** `springdoc-openapi` generated client types, list pagination and filters.

The backend changes (list `1.2`, refresh cookie) come before the frontend. Update `README.md`, add the frontend to `CLAUDE.md` (build and test commands), and record the work in `docs/TODO.md` as it lands.

## Open questions

- [x] **Where does the refresh token live?** `HttpOnly` cookie, with a strict CSP from nginx (2026-10-18).
- [x] **Single origin or two?** Single origin: Vite proxy in dev, nginx in Compose. No CORS (2026-10-18).
- [x] **React, or something you want to learn?** React + Vite + TypeScript (2026-10-18).
- [x] **Should the list API grow?** Yes: `X-API-Version: 1.2` with `category`, `date`, `version`. No pagination yet (2026-10-18).
- [x] **Do the user endpoints come first?** Moot: they already exist.
- [x] **Login throttling.** Moot: done. The UI shows 429 with `Retry-After`.
- [x] **Where do e2e tests run?** Locally only, against a separate e2e Compose stack with raised limits (2026-10-18).
- [x] **UI scope for categories.** Fixed enum (2026-10-18).
- [x] **Client IP behind nginx.** A fixed nginx IP in `TRUSTED_PROXIES`; never the whole subnet (2026-10-18).
- [x] **Cross-tab refresh.** Web Locks only (2026-10-18).
- [x] **App port 8080 with nginx in front.** Kept, bound to `127.0.0.1` (2026-10-18).
- [x] **Sessions on the profile screen.** Yes, list and revoke via `/users/me/sessions` (2026-10-18).
- [x] **Node version.** Node 22 LTS with Vite 7 (2026-10-18).
