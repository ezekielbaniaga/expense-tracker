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
import org.springframework.security.authentication.DisabledException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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
    void rotationResultIsUsableOutsideTransaction() {
        String token = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();

        // No web request here, so no open-session-in-view to rescue a lazy proxy
        RefreshTokenResult result = userSessionService.rotateRefreshToken(token);

        assertThat(result.userDetails().getUsername()).isEqualTo(user.getUsername());
        assertThat(result.userDetails().getUniqueId()).isEqualTo(user.getUniqueId());
        assertThat(result.userDetails().getRole()).isEqualTo(Role.USER.name());
    }

    @Test
    void disabledUserCannotRefreshAndSessionIsRevoked() throws Exception {
        String token = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();

        user.setEnabled(false);
        user = userRepository.save(user);

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(token))
            .isInstanceOf(DisabledException.class);

        // Revoked, so re-enabling the account does not bring the old token back
        assertThat(sessionFor(token).getRevokedAt()).isNotNull();

        user.setEnabled(true);
        user = userRepository.save(user);
        refresh(token).andExpect(status().isUnauthorized());
    }

    @Test
    void reusingRotatedTokenRevokesSession() {
        String first = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();
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
        String first = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();
        String second = userSessionService.rotateRefreshToken(first).newRawRefreshToken();
        String third = userSessionService.rotateRefreshToken(second).newRawRefreshToken();

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(first))
            .isInstanceOf(RefreshTokenReuseException.class);

        assertThat(sessionFor(third).getRevokedAt()).isNotNull();
    }

    @Test
    void unknownTokenIsRejectedWithoutRevokingAnything() {
        String current = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken("never-issued"))
            .isInstanceOf(BadCredentialsException.class)
            .isNotInstanceOf(RefreshTokenReuseException.class);

        assertThat(sessionFor(current).getRevokedAt()).isNull();
    }

    @Test
    void expiredSessionCannotRefresh() throws Exception {
        String token = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();
        UserSession session = sessionFor(token);
        session.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        userSessionRepository.save(session);

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(token))
            .isInstanceOf(BadCredentialsException.class)
            .isNotInstanceOf(RefreshTokenReuseException.class)
            .hasMessageContaining("expired");
        refresh(token).andExpect(status().isUnauthorized());

        // Not rotated and not revoked: expiry alone ends it, cleanup removes the row later
        UserSession after = sessionFor(token);
        assertThat(after.getRevokedAt()).isNull();
        assertThat(after.getLastUsedAt()).isEqualTo(session.getLastUsedAt());
    }

    @Test
    void revokedSessionCannotRefresh() throws Exception {
        String token = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();
        LocalDateTime revokedAt = LocalDateTime.now().minusMinutes(5);
        UserSession session = sessionFor(token);
        session.setRevokedAt(revokedAt);
        userSessionRepository.save(session);

        assertThatThrownBy(() -> userSessionService.rotateRefreshToken(token))
            .isInstanceOf(BadCredentialsException.class)
            .isNotInstanceOf(RefreshTokenReuseException.class)
            .hasMessageContaining("revoked");
        refresh(token).andExpect(status().isUnauthorized());

        // Still findable by the same token (not rotated), first revocation time kept
        UserSession after = sessionFor(token);
        assertThat(after.getRevokedAt()).isEqualToIgnoringNanos(revokedAt);
        assertThat(after.getLastUsedAt()).isEqualTo(session.getLastUsedAt());
    }

    @Test
    void concurrentRefreshesWithSameTokenLetOnlyOneSucceed() throws Exception {
        String token = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();
        int threads = 8;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);

        try {
            List<Future<String>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return userSessionService.rotateRefreshToken(token).newRawRefreshToken();
                }));
            }
            start.countDown();

            List<String> winners = new ArrayList<>();
            int rejected = 0;
            for (Future<String> result : results) {
                try {
                    winners.add(result.get(30, TimeUnit.SECONDS));
                } catch (ExecutionException ex) {
                    // Losers must be treated as reuse, not fail with a DB error
                    assertThat(ex.getCause()).isInstanceOf(RefreshTokenReuseException.class);
                    rejected++;
                }
            }

            assertThat(winners).hasSize(1);
            assertThat(rejected).isEqualTo(threads - 1);
            assertThat(sessionFor(winners.get(0)).getRevokedAt()).isNotNull();
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void refreshEndpointReturns401OnReuse() throws Exception {
        String first = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();

        refresh(first).andExpect(status().isOk());
        refresh(first).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRevokesSessionSoRefreshFails() throws Exception {
        String token = userSessionService.createSession(user.getId(), "test", "127.0.0.1").rawRefreshToken();

        // No access token needed: logout must work after the JWT expired
        logout(token).andExpect(status().isNoContent());

        assertThat(sessionFor(token).getRevokedAt()).isNotNull();
        refresh(token).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutOnlyRevokesThatSession() throws Exception {
        String laptop = userSessionService.createSession(user.getId(), "laptop", "127.0.0.1").rawRefreshToken();
        String phone = userSessionService.createSession(user.getId(), "phone", "127.0.0.1").rawRefreshToken();

        logout(laptop).andExpect(status().isNoContent());

        assertThat(sessionFor(phone).getRevokedAt()).isNull();
        refresh(phone).andExpect(status().isOk());
    }

    @Test
    void logoutWithUnknownTokenStillReturns204() throws Exception {
        // Same answer either way, so the endpoint can't be used to probe tokens
        logout("never-issued").andExpect(status().isNoContent());
    }

    private org.springframework.test.web.servlet.ResultActions logout(String token) throws Exception {
        return mockMvc.perform(post("/auth/logout")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"refreshToken\":\"" + token + "\"}"));
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
