#!/usr/bin/sh

cd "$(dirname "$0")" || exit 1
(cd ../backend && ./build_docker_image.sh) && \
(cd ../frontend && ./build_docker_image.sh) && \
docker compose up -d && docker compose logs -f
