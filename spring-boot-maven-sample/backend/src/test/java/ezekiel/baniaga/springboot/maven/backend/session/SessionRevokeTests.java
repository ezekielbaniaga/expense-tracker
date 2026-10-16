package ezekiel.baniaga.springboot.maven.backend.session;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
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
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as UserMeTests and SessionListTests, so they share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class SessionRevokeTests {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mockMvc;
    @Autowired JsonMapper jsonMapper;
    @Autowired JWTService jwtService;
    @Autowired UserRepository userRepository;
    @Autowired CustomUserDetailsMapper customUserDetailsMapper;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    @Test
    void revokedSessionCannotRefreshButOtherSessionStillCan() throws Exception {
        String username = register("Alice");
        Tokens first = login(username);
        Tokens second = login(username);

        revoke(second.bearer(), sidOf(first)).andExpect(status().isNoContent());

        refresh(first.refreshToken()).andExpect(status().isUnauthorized());
        refresh(second.refreshToken()).andExpect(status().isOk());

        List<String> ids = JsonPath.read(listSessions(second.bearer()), "$[*].id");
        assertThat(ids).containsExactly(sidOf(second));
    }

    @Test
    void anotherUsersSessionIs404AndStaysActive() throws Exception {
        Tokens alice = login(register("Bob"));
        Tokens mallory = login(register("Mallory"));

        revoke(mallory.bearer(), sidOf(alice))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SESSION_NOT_FOUND"));

        refresh(alice.refreshToken()).andExpect(status().isOk());
    }

    @Test
    void unknownSessionIdIs404() throws Exception {
        Tokens tokens = login(register("Carol"));

        revoke(tokens.bearer(), UUID.randomUUID().toString())
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("SESSION_NOT_FOUND"));
    }

    // Owned but already revoked is still 204, so repeating the call is safe
    @Test
    void repeatingTheRevokeIs204() throws Exception {
        String username = register("Dave");
        Tokens first = login(username);
        Tokens second = login(username);

        revoke(second.bearer(), sidOf(first)).andExpect(status().isNoContent());
        revoke(second.bearer(), sidOf(first)).andExpect(status().isNoContent());
    }

    @Test
    void notAUuidIs400() throws Exception {
        Tokens tokens = login(register("Erin"));

        revoke(tokens.bearer(), "not-a-uuid")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    // Works like logout, but with the access token instead of the refresh token
    @Test
    void revokingTheCurrentSessionWorks() throws Exception {
        Tokens tokens = login(register("Frank"));

        revoke(tokens.bearer(), sidOf(tokens)).andExpect(status().isNoContent());

        refresh(tokens.refreshToken()).andExpect(status().isUnauthorized());
    }

    @Test
    void withoutTokenIs401() throws Exception {
        mockMvc.perform(delete("/users/me/sessions/{id}", UUID.randomUUID()))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void revokeAllOthersKeepsOnlyTheCurrentSession() throws Exception {
        String username = register("Grace");
        Tokens first = login(username);
        Tokens second = login(username);
        Tokens third = login(username);

        revokeAll(third.bearer())
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revoked").value(2));

        refresh(first.refreshToken()).andExpect(status().isUnauthorized());
        refresh(second.refreshToken()).andExpect(status().isUnauthorized());
        refresh(third.refreshToken()).andExpect(status().isOk());
    }

    // Already revoked sessions are not counted again
    @Test
    void repeatingRevokeAllOthersRevokesNothing() throws Exception {
        String username = register("Heidi");
        login(username);
        Tokens current = login(username);

        revokeAll(current.bearer()).andExpect(jsonPath("$.revoked").value(1));
        revokeAll(current.bearer())
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revoked").value(0));
    }

    // An older token without a sid can't say which session to keep, so every
    // session is revoked (WHERE unique_id <> NULL would match none)
    @Test
    void tokenWithoutSidRevokesEverySession() throws Exception {
        String username = register("Ivan");
        Tokens first = login(username);
        Tokens second = login(username);

        String noSidToken = jwtService.generateToken(customUserDetailsMapper.toCustomUserDetails(
            userRepository.findByUsername(username).orElseThrow()));

        revokeAll("Bearer " + noSidToken)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revoked").value(2));

        refresh(first.refreshToken()).andExpect(status().isUnauthorized());
        refresh(second.refreshToken()).andExpect(status().isUnauthorized());
    }

    // Only active sessions count: an expired one is already over, so it is not
    // counted and keeps revoked_at null
    @Test
    void revokeAllOthersSkipsExpiredSessions() throws Exception {
        String username = register("Judy");
        Tokens expired = login(username);
        login(username);
        Tokens current = login(username);
        expire(expired);

        revokeAll(current.bearer())
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revoked").value(1));

        assertThat(revokedAt(expired)).isNull();
    }

    // Same for a token without a sid, which revokes every session
    @Test
    void tokenWithoutSidSkipsExpiredSessions() throws Exception {
        String username = register("Ken");
        Tokens expired = login(username);
        login(username);
        expire(expired);

        String noSidToken = jwtService.generateToken(customUserDetailsMapper.toCustomUserDetails(
            userRepository.findByUsername(username).orElseThrow()));

        revokeAll("Bearer " + noSidToken)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revoked").value(1));

        assertThat(revokedAt(expired)).isNull();
    }

    @Test
    void revokeAllOthersWithoutTokenIs401() throws Exception {
        mockMvc.perform(delete("/users/me/sessions")).andExpect(status().isUnauthorized());
    }

    // The next two tests pin the decided access-token window (see the session
    // proposal): a revoke or logout ends the session for refresh at once, but an
    // access token already issued for it keeps working until it expires (15
    // minutes). Access tokens are not checked against the session on every
    // request. If a per-request sid check is ever added, change these tests on
    // purpose: the old access token should then get 401.
    @Test
    void revokedSessionsAccessTokenStillWorksUntilItExpires() throws Exception {
        String username = register("Liam");
        Tokens revoked = login(username);
        Tokens other = login(username);

        revoke(other.bearer(), sidOf(revoked)).andExpect(status().isNoContent());

        refresh(revoked.refreshToken()).andExpect(status().isUnauthorized());
        me(revoked.bearer())
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value(username));

        List<String> ids = JsonPath.read(listSessions(revoked.bearer()), "$[*].id");
        assertThat(ids).containsExactly(sidOf(other));
    }

    @Test
    void loggedOutSessionsAccessTokenStillWorksUntilItExpires() throws Exception {
        String username = register("Mia");
        Tokens loggedOut = login(username);
        Tokens other = login(username);

        logout(loggedOut.refreshToken()).andExpect(status().isNoContent());

        refresh(loggedOut.refreshToken()).andExpect(status().isUnauthorized());
        me(loggedOut.bearer())
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value(username));

        List<String> ids = JsonPath.read(listSessions(loggedOut.bearer()), "$[*].id");
        assertThat(ids).containsExactly(sidOf(other));
    }

    private record Tokens(String accessToken, String refreshToken) {
        String bearer() {
            return "Bearer " + accessToken;
        }
    }

    private ResultActions revoke(String bearer, String sessionId) throws Exception {
        return mockMvc.perform(delete("/users/me/sessions/{id}", sessionId)
            .header(HttpHeaders.AUTHORIZATION, bearer));
    }

    private ResultActions revokeAll(String bearer) throws Exception {
        return mockMvc.perform(delete("/users/me/sessions").header(HttpHeaders.AUTHORIZATION, bearer));
    }

    private ResultActions refresh(String refreshToken) throws Exception {
        return mockMvc.perform(post("/auth/refresh")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("refreshToken", refreshToken))));
    }

    private ResultActions logout(String refreshToken) throws Exception {
        return mockMvc.perform(post("/auth/logout")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("refreshToken", refreshToken))));
    }

    private ResultActions me(String bearer) throws Exception {
        return mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, bearer));
    }

    private String listSessions(String bearer) throws Exception {
        return mockMvc.perform(get("/users/me/sessions").header(HttpHeaders.AUTHORIZATION, bearer))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
    }

    private void expire(Tokens tokens) {
        jdbcTemplate.update("UPDATE user_sessions SET expires_at = ? WHERE unique_id = ?",
            LocalDateTime.now(clock).minusDays(1), UUID.fromString(sidOf(tokens)));
    }

    private LocalDateTime revokedAt(Tokens tokens) {
        return jdbcTemplate.queryForObject("SELECT revoked_at FROM user_sessions WHERE unique_id = ?",
            LocalDateTime.class, UUID.fromString(sidOf(tokens)));
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
