package ezekiel.baniaga.springboot.maven.backend.user;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as RegisterTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserMeTests {

    private static final String PASSWORD = "correct-horse-battery";
    private static final String NEW_PASSWORD = "staple-battery-horse-2";

    @Autowired MockMvc mockMvc;
    @Autowired JsonMapper jsonMapper;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;

    @Test
    void meReturnsOwnProfileWithoutPassword() throws Exception {
        String username = uniqueName("Alice");
        register(username);
        Tokens tokens = login(username, PASSWORD);
        User user = userRepository.findByUsername(username).orElseThrow();

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(user.getUniqueId().toString()))
            .andExpect(jsonPath("$.username").value(username))
            .andExpect(jsonPath("$.role").value("USER"))
            .andExpect(jsonPath("$.createdAt").exists())
            .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void meWithoutTokenIs401() throws Exception {
        mockMvc.perform(get("/users/me"))
            .andExpect(status().isUnauthorized());
    }

    // 400, not 401: a client must not treat a typo in the current password as a logout
    @Test
    void wrongCurrentPasswordIs400AndChangesNothing() throws Exception {
        String username = uniqueName("Bob");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        changePassword(tokens, "not-the-password-at-all", NEW_PASSWORD)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));

        User user = userRepository.findByUsername(username).orElseThrow();
        assertThat(passwordEncoder.matches(PASSWORD, user.getPassword())).isTrue();
        assertThat(user.getLastModified()).isNull();
        refresh(tokens.refreshToken()).andExpect(status().isOk());
    }

    @Test
    void weakNewPasswordIs400() throws Exception {
        String username = uniqueName("Carol");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        changePassword(tokens, PASSWORD, "short")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
        changePassword(tokens, PASSWORD, username.toUpperCase())
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
    }

    @Test
    void blankInputIsAValidationError() throws Exception {
        String username = uniqueName("Dave");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        changePassword(tokens, "", "")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void passwordChangeRevokesAllSessionsAndNewPasswordLogsIn() throws Exception {
        String username = uniqueName("Erin");
        register(username);
        Tokens first = login(username, PASSWORD);
        Tokens second = login(username, PASSWORD);

        changePassword(first, PASSWORD, NEW_PASSWORD)
            .andExpect(status().isNoContent());

        User user = userRepository.findByUsername(username).orElseThrow();
        assertThat(user.getLastModified()).isNotNull();

        // Every session ends, the one that made the change included
        refresh(first.refreshToken()).andExpect(status().isUnauthorized());
        refresh(second.refreshToken()).andExpect(status().isUnauthorized());

        loginRequest(username, PASSWORD).andExpect(status().isUnauthorized());
        Tokens fresh = login(username, NEW_PASSWORD);
        refresh(fresh.refreshToken()).andExpect(status().isOk());
    }

    private record Tokens(String accessToken, String refreshToken) {
        String bearer() {
            return "Bearer " + accessToken;
        }
    }

    private void register(String username) throws Exception {
        mockMvc.perform(post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", username, "password", PASSWORD))))
            .andExpect(status().isCreated());
    }

    private ResultActions loginRequest(String username, String password) throws Exception {
        return mockMvc.perform(post("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("username", username, "password", password))));
    }

    private Tokens login(String username, String password) throws Exception {
        String body = loginRequest(username, password)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return new Tokens(JsonPath.read(body, "$.accessToken"), JsonPath.read(body, "$.refreshToken"));
    }

    private ResultActions refresh(String refreshToken) throws Exception {
        return mockMvc.perform(post("/auth/refresh")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("refreshToken", refreshToken))));
    }

    private ResultActions changePassword(Tokens tokens, String current, String next) throws Exception {
        return mockMvc.perform(post("/users/me/password")
            .header(HttpHeaders.AUTHORIZATION, tokens.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("currentPassword", current, "newPassword", next))));
    }

    private String json(Map<String, String> body) {
        return jsonMapper.writeValueAsString(body);
    }

    private static String uniqueName(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
