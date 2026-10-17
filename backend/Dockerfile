# Pinned (JRE: the app only needs java -jar) so a rebuild cannot silently change the JVM; bump on purpose
FROM eclipse-temurin:25.0.4_7-jre-noble
# The base image has neither curl nor wget; curl is for the healthcheck below
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
# Unprivileged user: the JVM should not run as root inside the container
RUN groupadd --system app && useradd --system --gid app --no-create-home app && mkdir /opt/app
# Jar stays owned by root, so the app can read but not modify it
COPY target/expense-tracker-1.0.jar /opt/app
USER app
# /actuator/health is public and answers only {"status":"UP"} (503 when e.g. Postgres is down).
# The start period covers Flyway and Spring startup.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://localhost:8080/actuator/health || exit 1
CMD ["java", "-jar", "/opt/app/expense-tracker-1.0.jar"]
