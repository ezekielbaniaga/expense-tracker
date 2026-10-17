package ezekiel.baniaga.springboot.maven.backend.auth;

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
 * Runs against a real server: MockMvc never forwards errors to /error,
 * so it can't catch Spring Security rejecting that forward as 401.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ErrorResponseStatusTests {

    @LocalServerPort int port;
    @Autowired UserRepository userRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;

    private final HttpClient http = HttpClient.newHttpClient();

    @Test
    void malformedJsonIs400NotUnauthorized() throws Exception {
        HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/auth/login"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{bad json")));

        assertThat(response.statusCode()).isEqualTo(400);
    }

    @Test
    void missingRequiredParameterIs400ForLoggedInUser() throws Exception {
        HttpResponse<String> response = send(HttpRequest.newBuilder(
                uri("/api/expense/" + UUID.randomUUID()))
            .header("Authorization", bearer())
            .DELETE());

        assertThat(response.statusCode()).isEqualTo(400);
    }

    @Test
    void protectedEndpointWithoutTokenIsStill401() throws Exception {
        HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/api/expense")).GET());

        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Test
    void errorPageCannotBeRequestedDirectly() throws Exception {
        HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/error")).GET());

        assertThat(response.statusCode()).isEqualTo(401);
    }

    private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    private String bearer() {
        User user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("user-" + UUID.randomUUID());
        user.setPassword("not-used");
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.save(user);
        return "Bearer " + jwtService.generateToken(mapper.toCustomUserDetails(user));
    }
}
