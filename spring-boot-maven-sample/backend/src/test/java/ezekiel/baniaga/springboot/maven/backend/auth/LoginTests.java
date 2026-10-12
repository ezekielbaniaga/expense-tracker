package ezekiel.baniaga.springboot.maven.backend.auth;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.session.RefreshTokenHasher;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionRepository;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as RefreshTokenReuseTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class LoginTests {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired UserSessionRepository userSessionRepository;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JWTService jwtService;

    private User user;

    @BeforeEach
    void createUser() {
        user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("user-" + UUID.randomUUID());
        user.setPassword(passwordEncoder.encode(PASSWORD));
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.save(user);
    }

    @Test
    void correctLoginReturnsTokensAndRecordsSession() throws Exception {
        String body = login(user.getUsername(), PASSWORD)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        String accessToken = JsonPath.read(body, "$.accessToken");
        String refreshToken = JsonPath.read(body, "$.refreshToken");

        assertThat(jwtService.parsePrincipal(accessToken)).hasValueSatisfying(principal -> {
            assertThat(principal.userId()).isEqualTo(user.getUniqueId());
            assertThat(principal.username()).isEqualTo(user.getUsername());
            assertThat(principal.role()).isEqualTo("USER");
        });

        // Only the hash is stored, along with where the login came from
        UserSession session = userSessionRepository
            .findByRefreshTokenHash(refreshTokenHasher.hash(refreshToken)).orElseThrow();
        assertThat(session.getUserAgent()).isEqualTo("LoginTests");
        assertThat(session.getIpAddress()).isEqualTo("127.0.0.1");
        assertThat(session.getRevokedAt()).isNull();
        assertThat(session.getExpiresAt()).isAfter(LocalDateTime.now().plusDays(29));
    }

    @Test
    void wrongPasswordIs401() throws Exception {
        login(user.getUsername(), "wrong-password").andExpect(status().isUnauthorized());
    }

    @Test
    void unknownUserIs401() throws Exception {
        login("nobody-" + UUID.randomUUID(), PASSWORD).andExpect(status().isUnauthorized());
    }

    @Test
    void disabledUserIs401() throws Exception {
        user.setEnabled(false);
        userRepository.save(user);

        login(user.getUsername(), PASSWORD).andExpect(status().isUnauthorized());
    }

    @Test
    void blankCredentialsAreAValidationError() throws Exception {
        login("", "").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private ResultActions login(String username, String password) throws Exception {
        return mockMvc.perform(post("/auth/login")
            .header(HttpHeaders.USER_AGENT, "LoginTests")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"));
    }
}
