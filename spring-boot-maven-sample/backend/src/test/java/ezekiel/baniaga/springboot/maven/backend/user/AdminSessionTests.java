package ezekiel.baniaga.springboot.maven.backend.user;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
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

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as AdminUserTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AdminSessionTests {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mockMvc;
    @Autowired JsonMapper jsonMapper;
    @Autowired UserService userService;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;
    @Autowired JdbcTemplate jdbcTemplate;

    private User admin;
    private Tokens adminTokens;

    @BeforeEach
    void createAdmin() throws Exception {
        admin = createUser(Role.ADMIN);
        adminTokens = login(admin);
    }

    @Test
    void adminSeesTheTargetsSessions() throws Exception {
        User target = createUser(Role.USER);
        Tokens first = login(target);
        Tokens second = login(target);
        Tokens other = login(createUser(Role.USER));

        String body = listSessions(adminTokens.bearer(), target.getUniqueId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        List<String> ids = JsonPath.read(body, "$[*].id");
        assertThat(ids).containsExactlyInAnyOrder(sidOf(first), sidOf(second))
            .doesNotContain(sidOf(other), sidOf(adminTokens));
        // current marks only the admin's own session, which isn't in the target's list
        List<Boolean> current = JsonPath.read(body, "$[*].current");
        assertThat(current).containsExactly(false, false);
        assertThat(body).doesNotContain("refreshTokenHash");
    }

    @Test
    void adminListingTheirOwnIdSeesTheirSessionAsCurrent() throws Exception {
        String body = listSessions(adminTokens.bearer(), admin.getUniqueId())
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        List<String> currentIds = JsonPath.read(body, "$[?(@.current == true)].id");
        assertThat(currentIds).containsExactly(sidOf(adminTokens));
    }

    @Test
    void userIsForbidden() throws Exception {
        User target = createUser(Role.USER);
        login(target);
        Tokens user = login(createUser(Role.USER));

        listSessions(user.bearer(), target.getUniqueId())
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    // The demoted admin's access token still says ADMIN until it expires
    @Test
    void demotedAdminsOldTokenIsForbidden() throws Exception {
        User demoted = createUser(Role.ADMIN);
        String staleBearer = bearer(demoted);
        jdbcTemplate.update("UPDATE users SET role = 'USER' WHERE id = ?", demoted.getId().intValue());

        listSessions(staleBearer, admin.getUniqueId())
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test
    void unknownUserIs404() throws Exception {
        listSessions(adminTokens.bearer(), UUID.randomUUID())
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    // /users/me/sessions must route to UserController, not to /{id} with "me" as a UUID (400)
    @Test
    void adminCallingMeSessionsGetsTheirOwnList() throws Exception {
        String body = mockMvc.perform(get("/users/me/sessions")
                .header(HttpHeaders.AUTHORIZATION, adminTokens.bearer()))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        List<String> currentIds = JsonPath.read(body, "$[?(@.current == true)].id");
        assertThat(currentIds).containsExactly(sidOf(adminTokens));
    }

    private record Tokens(String accessToken, String refreshToken) {
        String bearer() {
            return "Bearer " + accessToken;
        }
    }

    private ResultActions listSessions(String bearer, UUID userId) throws Exception {
        return mockMvc.perform(get("/users/" + userId + "/sessions").header(HttpHeaders.AUTHORIZATION, bearer));
    }

    private String sidOf(Tokens tokens) {
        return jwtService.extractPrincipal(tokens.accessToken()).sessionId().toString();
    }

    private Tokens login(User user) throws Exception {
        String body = mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonMapper.writeValueAsString(
                    Map.of("username", user.getUsername(), "password", PASSWORD))))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return new Tokens(JsonPath.read(body, "$.accessToken"), JsonPath.read(body, "$.refreshToken"));
    }

    private User createUser(Role role) {
        return userService.createUser(
            role.name().toLowerCase() + "-" + UUID.randomUUID().toString().substring(0, 8), PASSWORD, role);
    }

    private String bearer(User user) {
        return "Bearer " + jwtService.generateToken(mapper.toCustomUserDetails(user));
    }
}
