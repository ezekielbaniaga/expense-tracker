package ezekiel.baniaga.springboot.maven.backend;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Starts a throwaway PostgreSQL container for tests.
 * <p>
 * {@code @ServiceConnection} makes Spring Boot point the datasource at the
 * container, overriding the localhost settings in application.yml.
 * Same image as docker_compose so Flyway migrations run against the real DB.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer("postgres:18.3-bookworm");
    }
}
