package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.session.job.UserSessionCleanup;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Session lifetime, active-session cap and retention of ended sessions come
 * from app.session.*, not from constants. Each is set here to a value far from
 * its default (30d, 10, 7d). Own Spring context (and container), because the
 * properties differ.
 */
@SpringBootTest(properties = {
    "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long",
    "app.session.lifetime=2d",
    "app.session.max-active=3",
    "app.session.retention=1d"
})
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class SessionPropertiesTests {

    @Autowired UserSessionService userSessionService;
    @Autowired UserSessionRepository userSessionRepository;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @Autowired UserSessionCleanup userSessionCleanup;
    @Autowired UserService userService;
    @Autowired CustomUserDetailsMapper customUserDetailsMapper;
    @Autowired Clock clock;

    private User user;

    @BeforeEach
    void setUp() {
        user = userService.createUser("props-" + UUID.randomUUID(), "not-used-here", Role.USER);
    }

    @Test
    void sessionLifetimeComesFromProperties() {
        LocalDateTime before = LocalDateTime.now(clock);
        UserSession session = session(newSession());
        LocalDateTime after = LocalDateTime.now(clock);

        assertThat(session.getExpiresAt()).isBetween(before.plusDays(2), after.plusDays(2));
    }

    @Test
    void activeSessionCapComesFromProperties() {
        for (int i = 0; i < 5; i++) {
            newSession();
        }

        assertThat(userSessionRepository.findActiveByUserId(user.getId(), LocalDateTime.now(clock)))
            .hasSize(3);
    }

    @Test
    void cleanupRetentionComesFromProperties() {
        LocalDateTime now = LocalDateTime.now(clock);

        // Past the 1 day retention, though within the 7 day default
        UserSession pastRetention = session(newSession());
        pastRetention.setRevokedAt(now.minusDays(2));
        userSessionRepository.save(pastRetention);

        UserSession withinRetention = session(newSession());
        withinRetention.setRevokedAt(now.minusHours(12));
        userSessionRepository.save(withinRetention);

        userSessionCleanup.cleanup();

        assertThat(userSessionRepository.existsById(pastRetention.getId())).isFalse();
        assertThat(userSessionRepository.existsById(withinRetention.getId())).isTrue();
    }

    private String newSession() {
        return userSessionService.createSession(
            customUserDetailsMapper.toCustomUserDetails(user), "test", "127.0.0.1").rawRefreshToken();
    }

    private UserSession session(String rawToken) {
        return userSessionRepository.findByRefreshTokenHash(refreshTokenHasher.hash(rawToken)).orElseThrow();
    }
}
