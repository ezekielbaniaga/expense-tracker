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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

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

    @Test
    void revokeAllOthersWithoutTokenIs401() throws Exception {
        mockMvc.perform(delete("/users/me/sessions")).andExpect(status().isUnauthorized());
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
