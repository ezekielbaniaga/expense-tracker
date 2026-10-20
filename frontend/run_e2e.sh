#!/bin/sh
# Builds both images, starts the e2e Compose stack, runs Playwright against it and always
# removes the stack and its volume afterwards. Extra arguments go to `playwright test`.
# Installs the Chromium build the pinned Playwright expects first; when it is already there,
# that step does nothing.

cd "$(dirname "$0")" || exit 1

PROJECT=expense-tracker-e2e
COMPOSE_FILE=../docker_compose/docker-compose.e2e.yml

# Scoped to the e2e project, so the dev stack and its volume are never touched
trap 'docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down -v' EXIT

npx playwright install chromium && \
(cd ../backend && ./build_docker_image.sh) && \
./build_docker_image.sh && \
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --wait && \
npx playwright test "$@"
