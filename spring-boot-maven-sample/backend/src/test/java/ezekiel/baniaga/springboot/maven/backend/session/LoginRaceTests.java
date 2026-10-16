package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Login checks the password before createSession takes the user row lock. A
 * password change or disable that commits in between must not leave the login
 * with a live session. The steps run one after another here, in the order the
 * race would interleave them.
 */
// Same configuration as SessionCapTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class LoginRaceTests {

    private static final String PASSWORD = "correct-horse-battery";
    private static final String NEW_PASSWORD = "staple-battery-horse";

    @Autowired AuthenticationManager authenticationManager;
    @Autowired UserService userService;
    @Autowired UserSessionService userSessionService;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void passwordChangedAfterAuthenticationCreatesNoSession() {
        User user = register();
        CustomUserDetails authenticated = authenticate(user.getUsername());

        userService.changePassword(user.getUniqueId(), PASSWORD, NEW_PASSWORD);

        assertThatThrownBy(() -> userSessionService.createSession(authenticated, "test", "127.0.0.1"))
            .isInstanceOf(BadCredentialsException.class);
        assertThat(activeSessions(user)).isZero();
    }

    @Test
    void disabledAfterAuthenticationCreatesNoSession() {
        User user = register();
        CustomUserDetails authenticated = authenticate(user.getUsername());

        jdbcTemplate.update("UPDATE users SET enabled = false WHERE id = ?", user.getId());

        assertThatThrownBy(() -> userSessionService.createSession(authenticated, "test", "127.0.0.1"))
            .isInstanceOf(DisabledException.class);
        assertThat(activeSessions(user)).isZero();
    }

    // A role change also sets last_modified; it must not fail the login, and
    // the access token is built from the user read under the lock
    @Test
    void roleChangedAfterAuthenticationUsesTheCurrentRole() {
        User user = register();
        CustomUserDetails authenticated = authenticate(user.getUsername());

        jdbcTemplate.update("UPDATE users SET role = 'ADMIN', last_modified = now() WHERE id = ?", user.getId());

        CreatedSession created = userSessionService.createSession(authenticated, "test", "127.0.0.1");

        assertThat(created.userDetails().getRole()).isEqualTo("ADMIN");
        assertThat(activeSessions(user)).isEqualTo(1);
    }

    @Test
    void normalLoginCreatesSession() {
        User user = register();
        CustomUserDetails authenticated = authenticate(user.getUsername());

        CreatedSession created = userSessionService.createSession(authenticated, "test", "127.0.0.1");

        assertThat(created.rawRefreshToken()).isNotBlank();
        assertThat(created.userDetails().getUniqueId()).isEqualTo(user.getUniqueId());
        assertThat(created.userDetails().getRole()).isEqualTo("USER");
        assertThat(activeSessions(user)).isEqualTo(1);
    }

    private User register() {
        return userService.register("race-" + UUID.randomUUID().toString().substring(0, 8), PASSWORD);
    }

    private CustomUserDetails authenticate(String username) {
        return (CustomUserDetails) authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(username, PASSWORD))
            .getPrincipal();
    }

    private Integer activeSessions(User user) {
        return jdbcTemplate.queryForObject("""
            SELECT count(*) FROM user_sessions
            WHERE user_id = ? AND revoked_at IS NULL AND expires_at > now() AT TIME ZONE 'UTC'
            """, Integer.class, user.getId());
    }
}
