package ezekiel.baniaga.springboot.maven.backend.config;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The Compose healthcheck and a reverse proxy probe /actuator/health without a token, so it
 * must be public, say only UP/DOWN, and be the only actuator endpoint exposed.
 * Runs against a real server, like the healthcheck does.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class HealthEndpointTests {

    @LocalServerPort int port;
    @Autowired UserRepository userRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;

    private final HttpClient http = HttpClient.newHttpClient();

    @Test
    void healthWithoutTokenIsUpWithoutDetails() throws Exception {
        HttpResponse<String> response = get("/actuator/health", null);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"status\":\"UP\"}");
    }

    @Test
    void healthWithInvalidTokenIsStillUp() throws Exception {
        HttpResponse<String> response = get("/actuator/health", "Bearer not-a-jwt");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"status\":\"UP\"}");
    }

    @Test
    void healthForAdminHasNoDetailsEither() throws Exception {
        HttpResponse<String> response = get("/actuator/health", bearer(Role.ADMIN));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"status\":\"UP\"}");
    }

    @Test
    void healthSubpathsAreNotPublic() throws Exception {
        assertThat(get("/actuator/health/db", null).statusCode()).isEqualTo(401);
    }

    @Test
    void otherActuatorEndpointsAreNotReachableWithoutToken() throws Exception {
        for (String path : new String[] {"/actuator", "/actuator/env", "/actuator/beans"}) {
            assertThat(get(path, null).statusCode()).as(path).isIn(401, 404);
        }
    }

    @Test
    void otherActuatorEndpointsAreNotExposedEvenToAdmins() throws Exception {
        String admin = bearer(Role.ADMIN);
        for (String path : new String[] {"/actuator/env", "/actuator/beans"}) {
            assertThat(get(path, admin).statusCode()).as(path).isEqualTo(404);
        }
    }

    private HttpResponse<String> get(String path, String authorization) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(
            URI.create("http://localhost:" + port + path)).GET();
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String bearer(Role role) {
        User user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("user-" + UUID.randomUUID());
        user.setPassword("not-used");
        user.setRole(role);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.save(user);
        return "Bearer " + jwtService.generateToken(mapper.toCustomUserDetails(user));
    }
}
