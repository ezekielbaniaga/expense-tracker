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

Once the proxy is in front, **stop publishing `8080:8080`** (remove `ports:` from `app` and publish
the proxy's port instead). Otherwise a client can still reach the app directly through the Docker
port mapping; it arrives from the bridge gateway, and if `TRUSTED_PROXIES` is too broad (Tomcat's
default trusts every private range, gateway included), it could spoof its IP.
