# Important

This is what a production docker compose *might* look.

Demonstrates how property resolution works in Spring.
In which both relaxed and explicit mechanisms are used.

In reality, .env files shouldn't be placed in git repo!

## Setup

Copy the template and fill in real values (`.env` is git-ignored):

```sh
cp .env.example .env
```

Replace every `change-me`. The app refuses to start while `ADMIN_PASSWORD` is still `change-me`
(and `JWT_SECRET` must be at least 32 bytes). On the first start, when the admin is created,
`ADMIN_PASSWORD` must be at least 12 characters; after that it is not read again for that admin.


## Health

The `app` service has a healthcheck on `GET /actuator/health` (public, answers only
`{"status":"UP"}`, or 503 when e.g. Postgres is down). The image installs `curl` for it, since
`eclipse-temurin` ships without curl or wget. `docker compose ps` shows `healthy` once the app
is up (allow up to a minute for startup). A proxy service can wait for it with
`depends_on: app: condition: service_healthy`. Rebuild the image (`build_docker_image.sh`) to
get the healthcheck.

## Behind a reverse proxy

The app takes the client IP (stored with each login session) from `X-Forwarded-For`, but only
when the request comes from an address matching `TRUSTED_PROXIES` (a regex, e.g.
`172[.]18[.]0[.]10`; give the proxy a fixed IP on `app-network`). Empty, the default here, trusts
no one and the header is ignored.

The `web` service (nginx, `expense-tracker-web:1.0`) is that proxy: it has the fixed IP
`172.28.0.10` on `app-network` (subnet `172.28.0.0/24`), and `TRUSTED_PROXIES` defaults to
`172[.]28[.]0[.]10`, only that address, never the subnet. Browsers use `web` on port 8081. The
app's port is published on `127.0.0.1:8080` only (Bruno and debugging); published on all
interfaces, a client could reach the app directly through the Docker port mapping, arrive from the
bridge gateway, and if `TRUSTED_PROXIES` were too broad (Tomcat's default trusts every private
range, gateway included), spoof its IP. Changing the subnet recreates `app-network`, so run
`./stop_compose.sh` first.

## Web UI

Open `http://localhost:8081`. `./run_compose.sh` builds both images (`backend/` and `frontend/`
`build_docker_image.sh`) and starts the stack. The refresh cookie's `Origin` check accepts
`http://localhost:8081`; to serve the UI from another origin, add it to
`app.auth.refresh-cookie.allowed-origins` (`APP_AUTH_REFRESHCOOKIE_ALLOWEDORIGINS`).

## End-to-end stack

`docker-compose.e2e.yml` is a throwaway stack for the Playwright suite: project `expense-tracker-e2e`,
its own containers, volume and subnet (`172.29.0.0/24`, `web` at `172.29.0.10`, which is what its
`TRUSTED_PROXIES` names), the UI on `127.0.0.1:18081`, so it runs next to the main stack. It uses public
test secrets and `APP_JWT_EXPIRATION=75s` so the specs see scheduled refreshes. Run it with
`../frontend/run_e2e.sh` (or `npm run e2e` in `frontend/`), which builds the images, runs the specs and
removes the stack and its volume.
