package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Unlike LoginRaceTests, the steps here really overlap: a login holds the user
 * row lock (inside createSession, not yet committed) while a password change
 * or admin disable runs on another thread. The change must wait for the login
 * to commit and then revoke the session it created, so no login that passed
 * the old password check outlives the change.
 */
// Same configuration as LoginRaceTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class LoginLockRaceTests {

    private static final String PASSWORD = "correct-horse-battery";
    private static final String NEW_PASSWORD = "staple-battery-horse";

    @Autowired AuthenticationManager authenticationManager;
    @Autowired UserService userService;
    @Autowired UserSessionService userSessionService;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired MockMvc mockMvc;

    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    @AfterEach
    void shutdown() {
        executor.shutdownNow();
    }

    @Test
    void passwordChangeWaitsForLoginHoldingUserRowAndRevokesItsSession() throws Exception {
        User user = register();
        CustomUserDetails authenticated = authenticate(user.getUsername());

        CountDownLatch release = new CountDownLatch(1);
        Future<?> login = loginHoldingLock(authenticated, release);

        Future<?> change = executor.submit(() ->
            userService.changePassword(user.getUniqueId(), PASSWORD, NEW_PASSWORD));

        awaitBlockedOnLock();
        assertThat(change.isDone()).isFalse();

        release.countDown();
        login.get(10, TimeUnit.SECONDS);
        change.get(10, TimeUnit.SECONDS);

        assertThat(activeSessions(user)).isZero();

        // A login that checked the old password before the change is rejected under the lock
        assertThatThrownBy(() -> userSessionService.createSession(authenticated, "test", "127.0.0.1"))
            .isInstanceOf(BadCredentialsException.class);
        loginRequest(user.getUsername(), PASSWORD).andExpect(status().isUnauthorized());
        assertThat(activeSessions(user)).isZero();
    }

    // updateUser already flushes the users UPDATE before revoking; this pins it
    @Test
    void adminDisableWaitsForLoginHoldingUserRowAndRevokesItsSession() throws Exception {
        User admin = userService.createUser(uniqueName("admin"), PASSWORD, Role.ADMIN);
        User user = register();
        CustomUserDetails authenticated = authenticate(user.getUsername());

        CountDownLatch release = new CountDownLatch(1);
        Future<?> login = loginHoldingLock(authenticated, release);

        Future<?> disable = executor.submit(() ->
            userService.updateUser(admin.getUniqueId(), user.getUniqueId(), user.getVersion(), false, null));

        awaitBlockedOnLock();
        assertThat(disable.isDone()).isFalse();

        release.countDown();
        login.get(10, TimeUnit.SECONDS);
        disable.get(10, TimeUnit.SECONDS);

        assertThat(activeSessions(user)).isZero();

        assertThatThrownBy(() -> userSessionService.createSession(authenticated, "test", "127.0.0.1"))
            .isInstanceOf(DisabledException.class);
        loginRequest(user.getUsername(), PASSWORD).andExpect(status().isUnauthorized());
        assertThat(activeSessions(user)).isZero();
    }

    /**
     * Runs createSession in a transaction that stays open until release, so
     * the user row stays locked (SELECT ... FOR UPDATE) with the new session
     * not yet committed. Returns once the lock is held.
     */
    private Future<?> loginHoldingLock(CustomUserDetails authenticated, CountDownLatch release) throws Exception {
        CountDownLatch locked = new CountDownLatch(1);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        Future<?> login = executor.submit(() -> tx.executeWithoutResult(status -> {
            userSessionService.createSession(authenticated, "test", "127.0.0.1");
            locked.countDown();
            try {
                assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }));
        assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
        return login;
    }

    private void awaitBlockedOnLock() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            Integer waiting = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM pg_stat_activity
                WHERE datname = current_database() AND wait_event_type = 'Lock'
                """, Integer.class);
            if (waiting != null && waiting > 0) {
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("Second transaction never waited for the user row lock");
    }

    private User register() {
        return userService.register(uniqueName("lockrace"), PASSWORD);
    }

    private static String uniqueName(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private CustomUserDetails authenticate(String username) {
        return (CustomUserDetails) authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(username, PASSWORD))
            .getPrincipal();
    }

    private ResultActions loginRequest(String username, String password)
            throws Exception {
        return mockMvc.perform(post("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"));
    }

    private Integer activeSessions(User user) {
        return jdbcTemplate.queryForObject("""
            SELECT count(*) FROM user_sessions
            WHERE user_id = ? AND revoked_at IS NULL AND expires_at > now()
            """, Integer.class, user.getId());
    }
}
