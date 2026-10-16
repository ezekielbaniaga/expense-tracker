package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.session.job.UserSessionCleanup;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Same configuration as RefreshTokenReuseTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserSessionCleanupTests {

    @Autowired UserSessionService userSessionService;
    @Autowired UserSessionRepository userSessionRepository;
    @Autowired UsedRefreshTokenRepository usedRefreshTokenRepository;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @Autowired UserRepository userRepository;
    @Autowired CustomUserDetailsMapper customUserDetailsMapper;
    @Autowired Clock clock;
    @Autowired UserSessionCleanup userSessionCleanup;
    @Autowired JdbcTemplate jdbcTemplate;

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
    void deletesOnlySessionsThatEndedBeforeRetention() {
        LocalDateTime now = LocalDateTime.now(clock);

        Long active = sessionId(newSession());

        // Rotated once, so it also has a used token hash that must go with it
        String expiredFirst = newSession();
        String expiredCurrent = userSessionService.rotateRefreshToken(expiredFirst).newRawRefreshToken();
        Long expiredLongAgo = sessionId(expiredCurrent);
        update(expiredLongAgo, s -> s.setExpiresAt(now.minusDays(10)));

        Long revokedLongAgo = sessionId(newSession());
        update(revokedLongAgo, s -> s.setRevokedAt(now.minusDays(10)));

        Long revokedRecently = sessionId(newSession());
        update(revokedRecently, s -> s.setRevokedAt(now.minusDays(1)));

        int deleted = userSessionService.cleanupEndedSessions(Duration.ofDays(7), 1000);

        assertThat(deleted).isGreaterThanOrEqualTo(2);
        assertThat(userSessionRepository.existsById(expiredLongAgo)).isFalse();
        assertThat(userSessionRepository.existsById(revokedLongAgo)).isFalse();
        assertThat(usedRefreshTokenRepository.existsById(refreshTokenHasher.hash(expiredFirst))).isFalse();

        assertThat(userSessionRepository.existsById(active)).isTrue();
        assertThat(userSessionRepository.existsById(revokedRecently)).isTrue();
    }

    @Test
    void oneRunDeletesMoreThanOneBatch() {
        // 2.5 batches of 1,000; the old job deleted only 1,000 per run
        jdbcTemplate.update("""
            INSERT INTO user_sessions (unique_id, user_id, refresh_token_hash, created_at, expires_at)
            SELECT gen_random_uuid(), ?, encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), ?, ?
            FROM generate_series(1, 2500)
        """, user.getId(), LocalDateTime.now(clock).minusDays(40), LocalDateTime.now(clock).minusDays(10));
        assertThat(countSessionsOfUser()).isEqualTo(2500);

        userSessionCleanup.cleanup();

        assertThat(countSessionsOfUser()).isZero();
    }

    private long countSessionsOfUser() {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM user_sessions WHERE user_id = ?", Long.class, user.getId());
    }

    private String newSession() {
        return userSessionService.createSession(customUserDetailsMapper.toCustomUserDetails(user), "test", "127.0.0.1").rawRefreshToken();
    }

    private Long sessionId(String rawToken) {
        return userSessionRepository.findByRefreshTokenHash(refreshTokenHasher.hash(rawToken))
            .orElseThrow().getId();
    }

    private void update(Long id, java.util.function.Consumer<UserSession> change) {
        UserSession session = userSessionRepository.findById(id).orElseThrow();
        change.accept(session);
        userSessionRepository.save(session);
    }
}
