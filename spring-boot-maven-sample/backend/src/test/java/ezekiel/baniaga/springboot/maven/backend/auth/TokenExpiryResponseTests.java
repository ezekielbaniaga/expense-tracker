package ezekiel.baniaga.springboot.maven.backend.auth;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.props.JWTProperties;
import ezekiel.baniaga.springboot.maven.backend.session.RefreshTokenHasher;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionRepository;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.session.props.SessionProperties;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Login and refresh tell the client when its tokens expire: accessTokenExpiresIn
 * in seconds (app.jwt.expiration) and refreshTokenExpiresAt, the session's
 * expires_at as a UTC time without offset, like every other API timestamp.
 */
// Same configuration as LoginTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class TokenExpiryResponseTests {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired UserSessionRepository userSessionRepository;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JWTProperties jwtProperties;
    @Autowired SessionProperties sessionProperties;

    private User user;

    @BeforeEach
    void createUser() {
        user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("expiry-" + UUID.randomUUID());
        user.setPassword(passwordEncoder.encode(PASSWORD));
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.save(user);
    }

    @Test
    void loginSaysWhenBothTokensExpire() throws Exception {
        String body = postJson("/auth/login",
            "{\"username\":\"" + user.getUsername() + "\",\"password\":\"" + PASSWORD + "\"}");

        Number expiresIn = JsonPath.read(body, "$.accessTokenExpiresIn");
        assertThat(expiresIn.longValue()).isEqualTo(jwtProperties.getExpiration().toSeconds());

        UserSession session = session(JsonPath.read(body, "$.refreshToken"));
        String expiresAt = JsonPath.read(body, "$.refreshTokenExpiresAt");
        assertUtcWithoutOffset(expiresAt);
        assertThat(LocalDateTime.parse(expiresAt)).isEqualTo(session.getExpiresAt());
        assertThat(session.getExpiresAt()).isEqualTo(session.getCreatedAt().plus(sessionProperties.getLifetime()));
    }

    // Refreshing doesn't extend the session, so refresh reports the same expires_at as login
    @Test
    void refreshSaysWhenBothTokensExpireAndKeepsTheSessionEnd() throws Exception {
        String login = postJson("/auth/login",
            "{\"username\":\"" + user.getUsername() + "\",\"password\":\"" + PASSWORD + "\"}");
        String loginExpiresAt = JsonPath.read(login, "$.refreshTokenExpiresAt");

        String body = postJson("/auth/refresh",
            "{\"refreshToken\":\"" + JsonPath.read(login, "$.refreshToken") + "\"}");

        Number expiresIn = JsonPath.read(body, "$.accessTokenExpiresIn");
        assertThat(expiresIn.longValue()).isEqualTo(jwtProperties.getExpiration().toSeconds());

        UserSession session = session(JsonPath.read(body, "$.refreshToken"));
        String expiresAt = JsonPath.read(body, "$.refreshTokenExpiresAt");
        assertUtcWithoutOffset(expiresAt);
        assertThat(LocalDateTime.parse(expiresAt)).isEqualTo(session.getExpiresAt());
        assertThat(expiresAt).isEqualTo(loginExpiresAt);
    }

    private static void assertUtcWithoutOffset(String timestamp) {
        assertThat(timestamp).doesNotEndWith("Z").doesNotContain("+");
    }

    private String postJson(String path, String json) throws Exception {
        return mockMvc.perform(
                post(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
    }

    private UserSession session(String rawRefreshToken) {
        return userSessionRepository.findByRefreshTokenHash(refreshTokenHasher.hash(rawRefreshToken)).orElseThrow();
    }
}
