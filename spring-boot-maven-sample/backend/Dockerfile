FROM eclipse-temurin:25
# Unprivileged user: the JVM should not run as root inside the container
RUN groupadd --system app && useradd --system --gid app --no-create-home app && mkdir /opt/app
# Jar stays owned by root, so the app can read but not modify it
COPY target/backend-1.0.jar /opt/app
USER app
CMD ["java", "-jar", "/opt/app/backend-1.0.jar"]
