package ezekiel.baniaga.springboot.maven.backend.common;

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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 400s raised by Spring MVC itself (before or during argument binding) must use the
 * same ErrorResponse body as every other error. Runs against a real server so the
 * /error forward path is exercised too.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class MvcBadRequestBodyTests {

    @LocalServerPort int port;
    @Autowired UserRepository userRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;
    @Autowired JsonMapper jsonMapper;

    private final HttpClient http = HttpClient.newHttpClient();

    @Test
    void malformedUuidPathVariable() throws Exception {
        HttpResponse<String> r = send(builder("/users/not-a-uuid").header("Authorization", bearer(Role.ADMIN)).GET());
        assertErrorResponse(r, "VALIDATION_ERROR");
    }

    @Test
    void unknownEnumInPatchBody() throws Exception {
        HttpResponse<String> r = send(builder("/users/" + UUID.randomUUID())
            .header("Authorization", bearer(Role.ADMIN))
            .header("Content-Type", "application/json")
            .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"role\":\"SUPER\"}")));
        assertErrorResponse(r, "MALFORMED_REQUEST");
    }

    @Test
    void nonNumericPageParameter() throws Exception {
        HttpResponse<String> r = send(builder("/users?page=abc").header("Authorization", bearer(Role.ADMIN)).GET());
        assertErrorResponse(r, "VALIDATION_ERROR");
    }

    @Test
    void malformedJsonOnPost() throws Exception {
        HttpResponse<String> r = send(builder("/auth/login")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{bad json")));
        assertErrorResponse(r, "MALFORMED_REQUEST");
    }

    @Test
    void missingRequiredVersionParameter() throws Exception {
        HttpResponse<String> r = send(builder("/api/expense/" + UUID.randomUUID())
            .header("Authorization", bearer(Role.USER))
            .DELETE());
        assertErrorResponse(r, "VALIDATION_ERROR");
        assertThat(jsonMapper.readTree(r.body()).get("messages").get(0).asString()).contains("version");
    }

    private void assertErrorResponse(HttpResponse<String> r, String code) throws Exception {
        assertThat(r.statusCode()).isEqualTo(400);
        JsonNode body = jsonMapper.readTree(r.body());
        assertThat(body.get("code").asString()).isEqualTo(code);
        assertThat(body.get("messages").isArray()).isTrue();
        assertThat(body.get("messages").size()).isGreaterThan(0);
        assertThat(body.get("timestamp").asString()).isNotBlank();
        assertThat(r.body()).doesNotContain("java.", "Exception", "com.fasterxml", "tools.jackson");
    }

    private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpRequest.Builder builder(String path) {
        return HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
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
