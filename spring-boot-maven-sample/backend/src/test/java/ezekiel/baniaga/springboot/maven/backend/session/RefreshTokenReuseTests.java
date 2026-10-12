package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
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
import org.springframework.http.MediaType;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RefreshTokenReuseTests {

    @Autowired UserSessionService userSessionService;
    @Autowired UserSessionRepository userSessionRepository;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @Autowired UserRepository userRepository;
    @Autowired MockMvc mockMvc;

    private User user;

    @BeforeEach
    void createUser() {
        user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("user-" + UUID.randomUUID());
        user.setPassword("not-used");
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.save(user);
    }

    @Test
    void reusingRotatedTokenRevokesSession() {
        String first = userSessionService.createSession(user.getId(), "test", "127.0.0.1");
        String second = userSessionService.rotateRefreshToken(first).newRawRefreshToken();

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(first))
            .isInstanceOf(RefreshTokenReuseException.class);

        assertThat(sessionFor(second).getRevokedAt()).isNotNull();

        // The legitimate (latest) token is now dead too
        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(second))
            .isInstanceOf(BadCredentialsException.class)
            .hasMessageContaining("revoked");
    }

    @Test
    void reuseIsDetectedAfterSeveralRotations() {
        String first = userSessionService.createSession(user.getId(), "test", "127.0.0.1");
        String second = userSessionService.rotateRefreshToken(first).newRawRefreshToken();
        String third = userSessionService.rotateRefreshToken(second).newRawRefreshToken();

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(first))
            .isInstanceOf(RefreshTokenReuseException.class);

        assertThat(sessionFor(third).getRevokedAt()).isNotNull();
    }

    @Test
    void unknownTokenIsRejectedWithoutRevokingAnything() {
        String current = userSessionService.createSession(user.getId(), "test", "127.0.0.1");

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken("never-issued"))
            .isInstanceOf(BadCredentialsException.class)
            .isNotInstanceOf(RefreshTokenReuseException.class);

        assertThat(sessionFor(current).getRevokedAt()).isNull();
    }

    @Test
    void refreshEndpointReturns401OnReuse() throws Exception {
        String first = userSessionService.createSession(user.getId(), "test", "127.0.0.1");

        refresh(first).andExpect(status().isOk());
        refresh(first).andExpect(status().isUnauthorized());
    }

    private org.springframework.test.web.servlet.ResultActions refresh(String token) throws Exception {
        return mockMvc.perform(post("/auth/refresh")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"refreshToken\":\"" + token + "\"}"));
    }

    private UserSession sessionFor(String rawToken) {
        return userSessionRepository.findByRefreshTokenHash(refreshTokenHasher.hash(rawToken))
            .orElseThrow();
    }
}
