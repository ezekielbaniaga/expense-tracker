package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.context.ActiveProfiles;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.TimeZone;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Session and user timestamps come from the injected Clock (UTC), not from
 * LocalDateTime.now() in the JVM's zone, and are stored as that UTC wall time
 * whatever the JVM zone is. The clock here starts years from now, so a code
 * path still reading the system time would be far off. Own Spring context
 * (and container), because the clock is replaced.
 */
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, SessionClockTests.ClockConfig.class})
class SessionClockTests {

    private static final Instant START = Instant.parse("2031-03-30T02:30:00Z");

    @Autowired MutableClock clock;
    @Autowired UserSessionService userSessionService;
    @Autowired UserSessionRepository userSessionRepository;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @Autowired UserService userService;
    @Autowired CustomUserDetailsMapper customUserDetailsMapper;
    @Autowired JdbcTemplate jdbcTemplate;

    private User user;

    @BeforeEach
    void setUp() {
        clock.set(START);
        user = userService.createUser("clock-" + UUID.randomUUID(), "not-used-here", Role.USER);
    }

    @Test
    void userAndSessionTimestampsComeFromTheClock() {
        LocalDateTime now = LocalDateTime.ofInstant(START, ZoneOffset.UTC);

        UserSession session = session(newSession());

        assertThat(user.getCreatedAt()).isEqualTo(now);
        assertThat(session.getCreatedAt()).isEqualTo(now);
        assertThat(session.getLastUsedAt()).isEqualTo(now);
        assertThat(session.getExpiresAt()).isEqualTo(now.plusDays(30));
    }

    // Asia/Manila is UTC+8. In Europe/Berlin START is 04:30 summer time, and its UTC wall
    // time 02:30 falls in the gap of that morning's switch, so it must not be read as a local time
    @Test
    void storedTimestampIsTheUtcWallTimeWhateverTheJvmZone() {
        for (String zone : new String[] {"Asia/Manila", "Europe/Berlin", "America/New_York"}) {
            String raw = inJvmZone(zone, this::newSession);

            String createdAt = jdbcTemplate.queryForObject(
                "SELECT created_at::text FROM user_sessions WHERE refresh_token_hash = ?",
                String.class, refreshTokenHasher.hash(raw));
            assertThat(createdAt).as(zone).isEqualTo("2031-03-30 02:30:00");
        }
    }

    @Test
    void sessionExpiresWhenTheClockPassesExpiresAt() {
        String raw = newSession();

        clock.advance(Duration.ofDays(30).minusMinutes(1));
        String rotated = userSessionService.rotateRefreshToken(raw).newRawRefreshToken();
        assertThat(userSessionService.listActiveSessions(user.getUniqueId(), null)).hasSize(1);

        clock.advance(Duration.ofMinutes(2));
        assertThat(userSessionService.listActiveSessions(user.getUniqueId(), null)).isEmpty();
        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(rotated))
            .isInstanceOf(BadCredentialsException.class)
            .hasMessage("Refresh token has expired");
    }

    // The cleanup is a native query, whose parameters Hibernate binds differently; on a
    // non-UTC JVM a zone conversion there would move the cutoff by hours
    @Test
    void cleanupCutoffFollowsTheClock() {
        Long revoked = session(newSession()).getId();
        userSessionService.revokeAllForUser(user.getId());

        clock.advance(Duration.ofDays(7).minusMinutes(1));
        inJvmZone("Asia/Manila", () -> userSessionService.cleanupEndedSessions(Duration.ofDays(7), 1000));
        assertThat(userSessionRepository.existsById(revoked)).isTrue();

        clock.advance(Duration.ofMinutes(2));
        inJvmZone("Asia/Manila", () -> userSessionService.cleanupEndedSessions(Duration.ofDays(7), 1000));
        assertThat(userSessionRepository.existsById(revoked)).isFalse();
    }

    // The cutoff 2031-03-30T02:30 falls in the Europe/Berlin DST gap. Bound through the JVM
    // zone it would arrive as 03:30 and also delete the session revoked at 02:45
    @Test
    void cleanupCutoffInADstGapOfTheJvmZoneIsNotShifted() {
        Long before = session(newSession()).getId();
        Long after = session(newSession()).getId();
        jdbcTemplate.update("UPDATE user_sessions SET revoked_at = '2031-03-30 02:15:00' WHERE id = ?", before);
        jdbcTemplate.update("UPDATE user_sessions SET revoked_at = '2031-03-30 02:45:00' WHERE id = ?", after);

        clock.advance(Duration.ofDays(7));
        inJvmZone("Europe/Berlin", () -> userSessionService.cleanupEndedSessions(Duration.ofDays(7), 1000));

        assertThat(userSessionRepository.existsById(before)).isFalse();
        assertThat(userSessionRepository.existsById(after)).isTrue();
    }

    private String newSession() {
        return userSessionService.createSession(
            customUserDetailsMapper.toCustomUserDetails(user), "test", "127.0.0.1").rawRefreshToken();
    }

    // Runs with another JVM default zone, as on a host or container that isn't UTC
    private static <T> T inJvmZone(String zone, Supplier<T> action) {
        TimeZone original = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone(ZoneId.of(zone)));
            return action.get();
        } finally {
            TimeZone.setDefault(original);
        }
    }

    private UserSession session(String raw) {
        return userSessionRepository.findByRefreshTokenHash(refreshTokenHasher.hash(raw)).orElseThrow();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ClockConfig {
        @Bean
        @Primary
        MutableClock mutableClock() {
            return new MutableClock(START);
        }
    }

    static class MutableClock extends Clock {
        private volatile Instant instant;

        MutableClock(Instant instant) {
            this.instant = instant;
        }

        void set(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
