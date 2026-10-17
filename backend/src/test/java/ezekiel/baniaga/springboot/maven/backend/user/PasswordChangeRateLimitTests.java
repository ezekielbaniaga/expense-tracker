package ezekiel.baniaga.springboot.maven.backend.user;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import io.github.bucket4j.TimeMeter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Wrong current passwords on POST /users/me/password are limited per user. The production
 * limit is set here explicitly; every test uses its own users, since the buckets live as long
 * as the Spring context.
 */
@SpringBootTest(properties = {
    "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long",
    "app.rate-limit.password-change.failures.capacity=5",
    "app.rate-limit.password-change.failures.period=15m"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class PasswordChangeRateLimitTests {

    private static final String PASSWORD = "correct-horse-battery";
    private static final String WRONG = "not-the-password-at-all";
    // Fails PasswordValidator, so a correct current password changes nothing
    private static final String INVALID_NEW = "short";

    @Autowired MockMvc mockMvc;
    @Autowired JsonMapper jsonMapper;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired FakeTimeMeter timeMeter;

    @Test
    void sixthWrongCurrentPasswordIs429WithRetryAfter() throws Exception {
        String token = loginAsNewUser();

        for (int i = 0; i < 5; i++) {
            changePassword(token, WRONG, "staple-battery-horse-2")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));
        }

        String retryAfter = changePassword(token, WRONG, "staple-battery-horse-2")
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"))
            .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
            .andReturn().getResponse().getHeader(HttpHeaders.RETRY_AFTER);
        assertThat(Long.parseLong(retryAfter)).isPositive();
    }

    @Test
    void correctPasswordIs429UntilTheWindowPasses() throws Exception {
        User user = createUser();
        String token = login(user.getUsername());

        for (int i = 0; i < 5; i++) {
            changePassword(token, WRONG, "staple-battery-horse-2").andExpect(status().isBadRequest());
        }
        changePassword(token, PASSWORD, "staple-battery-horse-2").andExpect(status().isTooManyRequests());
        assertThat(passwordEncoder.matches(PASSWORD,
            userRepository.findByUsername(user.getUsername()).orElseThrow().getPassword())).isTrue();

        timeMeter.advance(Duration.ofMinutes(15));

        changePassword(token, PASSWORD, "staple-battery-horse-2").andExpect(status().isNoContent());
    }

    @Test
    void rightCurrentPasswordsDoNotCount() throws Exception {
        String token = loginAsNewUser();

        // Right current password, rejected new one: the guess was right, so it is no failure
        for (int i = 0; i < 8; i++) {
            changePassword(token, PASSWORD, INVALID_NEW)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
        }

        // All five failures are still available
        for (int i = 0; i < 5; i++) {
            changePassword(token, WRONG, "staple-battery-horse-2").andExpect(status().isBadRequest());
        }
        changePassword(token, WRONG, "staple-battery-horse-2").andExpect(status().isTooManyRequests());
    }

    @Test
    void successfulChangeDoesNotCount() throws Exception {
        User user = createUser();
        String token = login(user.getUsername());

        for (int i = 0; i < 4; i++) {
            changePassword(token, WRONG, "staple-battery-horse-2").andExpect(status().isBadRequest());
        }
        changePassword(token, PASSWORD, "staple-battery-horse-2").andExpect(status().isNoContent());

        // The access token outlives the revoked sessions; one failure is still left
        changePassword(token, WRONG, "staple-battery-horse-3").andExpect(status().isBadRequest());
        changePassword(token, WRONG, "staple-battery-horse-3").andExpect(status().isTooManyRequests());
    }

    @Test
    void anotherUserIsUnaffected() throws Exception {
        String locked = loginAsNewUser();
        String other = loginAsNewUser();

        for (int i = 0; i < 5; i++) {
            changePassword(locked, WRONG, "staple-battery-horse-2").andExpect(status().isBadRequest());
        }
        changePassword(locked, WRONG, "staple-battery-horse-2").andExpect(status().isTooManyRequests());

        changePassword(other, WRONG, "staple-battery-horse-2")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));
        changePassword(other, PASSWORD, "staple-battery-horse-2").andExpect(status().isNoContent());
    }

    @Test
    void overlongCurrentPasswordIs400() throws Exception {
        String token = loginAsNewUser();

        changePassword(token, "x".repeat(1001), "staple-battery-horse-2")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private String loginAsNewUser() throws Exception {
        return login(createUser().getUsername());
    }

    private User createUser() {
        User user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("pwlimit-" + UUID.randomUUID());
        user.setPassword(passwordEncoder.encode(PASSWORD));
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        return userRepository.save(user);
    }

    private String login(String username) throws Exception {
        String body = mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", username, "password", PASSWORD))))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.accessToken");
    }

    private ResultActions changePassword(String accessToken, String current, String next) throws Exception {
        return mockMvc.perform(post("/users/me/password")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("currentPassword", current, "newPassword", next))));
    }

    private String json(Map<String, String> body) {
        return jsonMapper.writeValueAsString(body);
    }

    /** Replaces the system clock the buckets refill by, so a test can skip the 15-minute window. */
    static class FakeTimeMeter implements TimeMeter {

        private final AtomicLong nanos = new AtomicLong(System.nanoTime());

        @Override
        public long currentTimeNanos() {
            return nanos.get();
        }

        @Override
        public boolean isWallClockBased() {
            return false;
        }

        void advance(Duration duration) {
            nanos.addAndGet(duration.toNanos());
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeTimeConfig {

        @Bean
        FakeTimeMeter fakeTimeMeter() {
            return new FakeTimeMeter();
        }
    }
}
