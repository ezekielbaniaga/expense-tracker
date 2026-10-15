package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

// Same configuration as UserSessionCleanupTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserSessionUniqueIdTests {

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired UserSessionService userSessionService;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @Autowired UserRepository userRepository;

    // unique_id is the public session id (looked up by the session endpoints);
    // user_id is filtered on by listing and revokeAllForUser
    @Test
    void uniqueIdAndUserIdAreIndexed() {
        Map<String, String> indexes = jdbcTemplate.queryForList(
                "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user_sessions'")
            .stream()
            .collect(Collectors.toMap(
                row -> (String) row.get("indexname"),
                row -> (String) row.get("indexdef")));

        assertThat(indexes).containsKeys(
            "idx_user_sessions_unique_id", "idx_user_sessions_user_id");
        assertThat(indexes.get("idx_user_sessions_unique_id"))
            .startsWith("CREATE UNIQUE INDEX")
            .contains("(unique_id)");
        assertThat(indexes.get("idx_user_sessions_user_id"))
            .startsWith("CREATE INDEX")
            .contains("(user_id)")
            .doesNotContain("WHERE");
    }

    @Test
    void uniqueIdIsNotNull() {
        String isNullable = jdbcTemplate.queryForObject(
            "SELECT is_nullable FROM information_schema.columns "
                + "WHERE table_name = 'user_sessions' AND column_name = 'unique_id'",
            String.class);

        assertThat(isNullable).isEqualTo("NO");
    }

    @Test
    void eachSessionGetsItsOwnUniqueId() {
        Long userId = newUser().getId();

        UUID first = uniqueIdOf(userSessionService.createSession(userId, "agent", "127.0.0.1").rawRefreshToken());
        UUID second = uniqueIdOf(userSessionService.createSession(userId, "agent", "127.0.0.1").rawRefreshToken());

        assertThat(first).isNotNull();
        assertThat(second).isNotNull();
        assertThat(first).isNotEqualTo(second);
        // v4 from UUID.randomUUID(), not a time-based generator
        assertThat(first.version()).isEqualTo(4);
    }

    private UUID uniqueIdOf(String rawRefreshToken) {
        return jdbcTemplate.queryForObject(
            "SELECT unique_id FROM user_sessions WHERE refresh_token_hash = ?",
            UUID.class,
            refreshTokenHasher.hash(rawRefreshToken));
    }

    // Tests share one database, so each test gets its own user
    private User newUser() {
        User user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("user-" + UUID.randomUUID());
        user.setPassword("not-used");
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        return userRepository.save(user);
    }
}
