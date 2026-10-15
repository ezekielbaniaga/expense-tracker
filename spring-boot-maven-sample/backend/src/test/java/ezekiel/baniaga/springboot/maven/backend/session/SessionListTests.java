package ezekiel.baniaga.springboot.maven.backend.session;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as UserMeTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class SessionListTests {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mockMvc;
    @Autowired JsonMapper jsonMapper;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired UserRepository userRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper customUserDetailsMapper;

    @Test
    void twoLoginsListTwoSessionsWithExactlyOneCurrent() throws Exception {
        String username = register("Alice");
        Tokens first = login(username);
        Tokens second = login(username);

        String body = listSessions(second.bearer());

        List<String> ids = JsonPath.read(body, "$[*].id");
        assertThat(ids).hasSize(2).doesNotHaveDuplicates();
        List<Boolean> current = JsonPath.read(body, "$[*].current");
        assertThat(current).containsExactlyInAnyOrder(true, false);

        // The current one is the session the access token came from
        List<String> currentIds = JsonPath.read(body, "$[?(@.current == true)].id");
        assertThat(currentIds).containsExactly(sidOf(second));
        assertThat(sidOf(first)).isNotEqualTo(sidOf(second));

        // The other login sees the same two sessions, with itself current
        List<String> fromFirst = JsonPath.read(listSessions(first.bearer()), "$[?(@.current == true)].id");
        assertThat(fromFirst).containsExactly(sidOf(first));
    }

    @Test
    void responseHasTheDocumentedFieldsAndNoTokenHash() throws Exception {
        String username = register("Bob");
        Tokens tokens = login(username);

        String body = listSessions(tokens.bearer());

        List<Map<String, Object>> sessions = JsonPath.read(body, "$");
        assertThat(sessions).hasSize(1);
        assertThat(sessions.get(0)).containsOnlyKeys(
            "id", "createdAt", "lastUsedAt", "expiresAt", "userAgent", "ipAddress", "current");
        assertThat(body).doesNotContain("refreshTokenHash");
        // id is the public unique_id, not the numeric database id
        assertThat(UUID.fromString((String) sessions.get(0).get("id"))).isNotNull();
    }

    @Test
    void revokedAndExpiredSessionsAreExcluded() throws Exception {
        String username = register("Carol");
        Tokens kept = login(username);
        Tokens revoked = login(username);
        Tokens expired = login(username);

        mockMvc.perform(post("/auth/logout")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("refreshToken", revoked.refreshToken()))))
            .andExpect(status().is2xxSuccessful());
        jdbcTemplate.update("UPDATE user_sessions SET expires_at = ? WHERE unique_id = ?",
            LocalDateTime.now().minusMinutes(1), UUID.fromString(sidOf(expired)));

        List<String> ids = JsonPath.read(listSessions(kept.bearer()), "$[*].id");
        assertThat(ids).containsExactly(sidOf(kept));
    }

    @Test
    void otherUsersSessionsAreExcluded() throws Exception {
        Tokens alice = login(register("Dave"));
        Tokens bob = login(register("Erin"));

        List<String> ids = JsonPath.read(listSessions(alice.bearer()), "$[*].id");
        assertThat(ids).containsExactly(sidOf(alice)).doesNotContain(sidOf(bob));
    }

    @Test
    void mostRecentlyUsedComesFirst() throws Exception {
        String username = register("Frank");
        Tokens older = login(username);
        Tokens newer = login(username);
        jdbcTemplate.update("UPDATE user_sessions SET last_used_at = ? WHERE unique_id = ?",
            LocalDateTime.now().minusHours(1), UUID.fromString(sidOf(newer)));

        List<String> ids = JsonPath.read(listSessions(newer.bearer()), "$[*].id");
        assertThat(ids).containsExactly(sidOf(older), sidOf(newer));
    }

    // Tokens issued before the sid claim existed: list works, nothing is current
    @Test
    void tokenWithoutSidMarksNoSessionCurrent() throws Exception {
        String username = register("Grace");
        login(username);
        User user = userRepository.findByUsername(username).orElseThrow();
        String noSid = jwtService.generateToken(customUserDetailsMapper.toCustomUserDetails(user));

        String body = listSessions("Bearer " + noSid);

        List<Boolean> current = JsonPath.read(body, "$[*].current");
        assertThat(current).containsExactly(false);
    }

    @Test
    void withoutTokenIs401() throws Exception {
        mockMvc.perform(get("/users/me/sessions"))
            .andExpect(status().isUnauthorized());
    }

    private record Tokens(String accessToken, String refreshToken) {
        String bearer() {
            return "Bearer " + accessToken;
        }
    }

    private String listSessions(String bearer) throws Exception {
        return mockMvc.perform(get("/users/me/sessions").header(HttpHeaders.AUTHORIZATION, bearer))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
    }

    private String sidOf(Tokens tokens) {
        return jwtService.extractPrincipal(tokens.accessToken()).sessionId().toString();
    }

    private String register(String prefix) throws Exception {
        String username = prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
        mockMvc.perform(post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", username, "password", PASSWORD))))
            .andExpect(status().isCreated());
        return username;
    }

    private Tokens login(String username) throws Exception {
        String body = mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", username, "password", PASSWORD))))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return new Tokens(JsonPath.read(body, "$.accessToken"), JsonPath.read(body, "$.refreshToken"));
    }

    private String json(Map<String, String> body) {
        return jsonMapper.writeValueAsString(body);
    }
}
