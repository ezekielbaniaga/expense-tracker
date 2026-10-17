#!/bin/sh
./mvnw clean install && \
docker build -t expense-tracker:1.0 .
