#!/bin/sh

# This will create a postgres container for development purposes.
# Setting up port 5432 to be exposed outside docker host for easy
# access with other tools like DBeaver.
#
# Checkout complete docker compose in ../docker_compose/
# to see common production setup like internal bridge
# network and internal DNS

docker rm dev-postgres-db 2>/dev/null || true
docker run --name=dev-postgres-db \
  -d \
  -p 5432:5432 \
  -e POSTGRES_USER=devuser \
  -e POSTGRES_PASSWORD=devpwd \
  -e POSTGRES_DB=appdb \
  -v pgdata_dev:/var/lib/postgresql \
  postgres:18.3-bookworm && \
docker logs -f dev-postgres-db
