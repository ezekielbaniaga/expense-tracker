package ezekiel.baniaga.springboot.maven.backend.auth;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as LoginTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RegisterTests {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired JsonMapper jsonMapper;

    @Test
    void registerCreatesUserAndReturns201WithoutPasswordOrTokens() throws Exception {
        String username = uniqueName("Alice");

        String body = register(username, PASSWORD)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").exists())
            .andExpect(jsonPath("$.username").value(username))
            .andExpect(jsonPath("$.role").value("USER"))
            .andExpect(jsonPath("$.createdAt").exists())
            .andExpect(jsonPath("$.password").doesNotExist())
            .andExpect(jsonPath("$.accessToken").doesNotExist())
            .andExpect(jsonPath("$.refreshToken").doesNotExist())
            .andReturn().getResponse().getContentAsString();

        User user = userRepository.findByUsername(username).orElseThrow();
        assertThat(user.getUniqueId().toString()).isEqualTo(JsonPath.read(body, "$.id"));
        assertThat(user.getRole()).isEqualTo(Role.USER);
        assertThat(user.isEnabled()).isTrue();
        assertThat(passwordEncoder.matches(PASSWORD, user.getPassword())).isTrue();
    }

    @Test
    void duplicateUsernameInOtherCaseIs409() throws Exception {
        String username = uniqueName("Bob");
        register(username, PASSWORD).andExpect(status().isCreated());

        register(username.toLowerCase(), PASSWORD)
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("USERNAME_TAKEN"));
    }

    @Test
    void shortPasswordIs400() throws Exception {
        register(uniqueName("carol"), "elevenchars")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
    }

    // BCrypt only hashes 72 bytes; 37 two-byte characters is 74 bytes but only 37 characters
    @Test
    void passwordOver72BytesIs400() throws Exception {
        register(uniqueName("dave"), "é".repeat(37))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
    }

    @Test
    void passwordEqualToUsernameIs400() throws Exception {
        String username = uniqueName("Erin");
        register(username, username.toLowerCase())
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
    }

    @Test
    void blankInputIsAValidationError() throws Exception {
        register("", "")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void newAccountCanLogInWithAnyCaseOfUsername() throws Exception {
        String username = uniqueName("Frank");
        register(username, PASSWORD).andExpect(status().isCreated());

        mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", username.toUpperCase(), "password", PASSWORD))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").exists())
            .andExpect(jsonPath("$.refreshToken").exists());
    }

    // V11's index is what stops two concurrent registrations that both pass the existence check
    @Test
    void databaseRejectsUsernamesDifferingOnlyInCase() {
        String username = uniqueName("Grace");
        insertUser(username);

        assertThatThrownBy(() -> insertUser(username.toUpperCase()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void insertUser(String username) {
        jdbcTemplate.update(
            "INSERT INTO users (unique_id, username, password, role, enabled, created_at) "
                + "VALUES (?, ?, 'x', 'USER', true, now())",
            UUID.randomUUID(), username);
    }

    private ResultActions register(String username, String password) throws Exception {
        return mockMvc.perform(post("/auth/register")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("username", username, "password", password))));
    }

    private String json(Map<String, String> body) {
        return jsonMapper.writeValueAsString(body);
    }

    private static String uniqueName(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
