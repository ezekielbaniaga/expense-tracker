#!/bin/bash

# Uses the local dev Postgres (run_postgres_container.sh) via the dev profile.
# Needs ADMIN_PASSWORD and JWT_SECRET in the environment.
SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE:-dev} \
java -jar target/expense-tracker-1.0.jar



