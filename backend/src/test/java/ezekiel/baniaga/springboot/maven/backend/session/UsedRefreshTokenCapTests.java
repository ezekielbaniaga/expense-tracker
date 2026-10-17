package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UsedRefreshTokenCapTests {

    private static final int ROTATIONS = 25;

    @Autowired UserSessionService userSessionService;
    @Autowired UserSessionRepository userSessionRepository;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @Autowired UserRepository userRepository;
    @Autowired CustomUserDetailsMapper customUserDetailsMapper;
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
    void rotationKeepsOnlyTheNewestUsedHashes() {
        // used.get(i) is the token rotated out by the (i+1)-th refresh
        List<String> used = new ArrayList<>();
        String current = rotate(ROTATIONS, used);
        Long sessionId = sessionIdOf(current);

        List<String> kept = jdbcTemplate.queryForList(
            "SELECT token_hash FROM used_refresh_tokens WHERE session_id = ?", String.class, sessionId);

        assertThat(kept).hasSize(UserSessionService.MAX_USED_TOKENS_PER_SESSION);
        assertThat(kept).containsExactlyInAnyOrderElementsOf(
            used.subList(ROTATIONS - UserSessionService.MAX_USED_TOKENS_PER_SESSION, ROTATIONS).stream()
                .map(refreshTokenHasher::hash)
                .toList());
    }

    @Test
    void newestUsedTokenStillTriggersReuseDetection() {
        List<String> used = new ArrayList<>();
        String current = rotate(ROTATIONS, used);

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(used.get(used.size() - 1)))
            .isInstanceOf(RefreshTokenReuseException.class);

        assertThat(userSessionRepository.findById(sessionIdOf(current)).orElseThrow().getRevokedAt()).isNotNull();
    }

    @Test
    void prunedTokenIsUnknownNotReuse() {
        List<String> used = new ArrayList<>();
        String current = rotate(ROTATIONS, used);

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(used.get(0)))
            .isInstanceOf(BadCredentialsException.class)
            .isNotInstanceOf(RefreshTokenReuseException.class)
            .hasMessageContaining("Invalid");

        // Not reuse, so the session is still usable
        assertThat(userSessionRepository.findById(sessionIdOf(current)).orElseThrow().getRevokedAt()).isNull();
        userSessionService.rotateRefreshToken(current);
    }

    @Test
    void pruningIsPerSession() {
        rotate(ROTATIONS, new ArrayList<>());
        String other = rotate(3, new ArrayList<>());

        Integer otherRows = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM used_refresh_tokens WHERE session_id = ?", Integer.class, sessionIdOf(other));
        assertThat(otherRows).isEqualTo(3);
    }

    /** Creates a session, refreshes it n times, collects the rotated-out tokens, returns the current one. */
    private String rotate(int n, List<String> used) {
        String token = userSessionService.createSession(
            customUserDetailsMapper.toCustomUserDetails(user), "test", "127.0.0.1").rawRefreshToken();
        for (int i = 0; i < n; i++) {
            used.add(token);
            token = userSessionService.rotateRefreshToken(token).newRawRefreshToken();
        }
        return token;
    }

    private Long sessionIdOf(String rawRefreshToken) {
        return userSessionRepository.findByRefreshTokenHash(refreshTokenHasher.hash(rawRefreshToken))
            .orElseThrow()
            .getId();
    }
}
