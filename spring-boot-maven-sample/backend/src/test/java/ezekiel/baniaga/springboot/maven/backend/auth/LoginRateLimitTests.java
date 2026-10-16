package ezekiel.baniaga.springboot.maven.backend.auth;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import io.github.bucket4j.TimeMeter;
import org.junit.jupiter.api.BeforeEach;
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

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The production limits, set here explicitly because the test profile raises them so other
 * tests (which share 127.0.0.1) never trip them. Every test uses its own random client IP and
 * users, since the buckets live as long as the Spring context.
 */
@SpringBootTest(properties = {
    "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long",
    "app.rate-limit.login.username-failures.capacity=5",
    "app.rate-limit.login.username-failures.period=15m",
    "app.rate-limit.login.client-ip.capacity=20",
    "app.rate-limit.login.client-ip.period=1m"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class LoginRateLimitTests {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired FakeTimeMeter timeMeter;

    private String ip;

    @BeforeEach
    void pickClientIp() {
        ip = randomIp();
    }

    @Test
    void sixthWrongPasswordForOneUserIs429WithRetryAfter() throws Exception {
        User user = createUser();

        // From a different IP each time, so only the per-username bucket can stop it
        for (int i = 0; i < 5; i++) {
            login(user.getUsername(), "wrong-password", randomIp()).andExpect(status().isUnauthorized());
        }

        String retryAfter = login(user.getUsername(), "wrong-password", randomIp())
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"))
            .andExpect(jsonPath("$.messages[0]").isNotEmpty())
            .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
            .andReturn().getResponse().getHeader(HttpHeaders.RETRY_AFTER);
        assertThat(Long.parseLong(retryAfter)).isPositive();

        // Locked out, so even the right password waits for the window
        login(user.getUsername(), PASSWORD, randomIp()).andExpect(status().isTooManyRequests());
    }

    @Test
    void usernameBucketIgnoresCaseAndSurroundingWhitespace() throws Exception {
        User user = createUser();
        String name = user.getUsername();
        String[] variants = { name, name.toUpperCase(Locale.ROOT), " " + name, name + " ", "  " + name.toUpperCase(Locale.ROOT) };

        for (String variant : variants) {
            login(variant, "wrong-password", randomIp()).andExpect(status().isUnauthorized());
        }

        login(name, "wrong-password", randomIp()).andExpect(status().isTooManyRequests());
    }

    @Test
    void unknownUsernameIsLimitedTheSameWay() throws Exception {
        // Same answers as for a real account, so the limit doesn't reveal which usernames exist
        String nobody = "nobody-" + UUID.randomUUID();

        for (int i = 0; i < 5; i++) {
            login(nobody, PASSWORD, randomIp()).andExpect(status().isUnauthorized());
        }

        login(nobody, PASSWORD, randomIp())
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"))
            .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void successfulLoginsDoNotCountAsFailures() throws Exception {
        User user = createUser();

        for (int i = 0; i < 8; i++) {
            login(user.getUsername(), PASSWORD, randomIp()).andExpect(status().isOk());
        }

        // All five failures are still available
        for (int i = 0; i < 5; i++) {
            login(user.getUsername(), "wrong-password", randomIp()).andExpect(status().isUnauthorized());
        }
        login(user.getUsername(), "wrong-password", randomIp()).andExpect(status().isTooManyRequests());
    }

    @Test
    void anotherUserFromTheSameIpIsUnaffectedUntilTheIpLimit() throws Exception {
        User locked = createUser();
        User other = createUser();

        // 6 attempts from this IP: 5 failures and one 429
        for (int i = 0; i < 5; i++) {
            login(locked.getUsername(), "wrong-password", ip).andExpect(status().isUnauthorized());
        }
        login(locked.getUsername(), "wrong-password", ip).andExpect(status().isTooManyRequests());

        // The other user logs in fine from the same IP for the rest of its 20 attempts
        for (int i = 0; i < 14; i++) {
            login(other.getUsername(), PASSWORD, ip).andExpect(status().isOk());
        }

        // 21st attempt from the IP, so many accounts can't be sprayed from one address
        login(other.getUsername(), PASSWORD, ip)
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"))
            .andExpect(header().exists(HttpHeaders.RETRY_AFTER));

        // Other addresses are unaffected
        login(other.getUsername(), PASSWORD, randomIp()).andExpect(status().isOk());
    }

    @Test
    void correctPasswordWorksAfterTheWindowPasses() throws Exception {
        User user = createUser();

        for (int i = 0; i < 5; i++) {
            login(user.getUsername(), "wrong-password", ip).andExpect(status().isUnauthorized());
        }
        login(user.getUsername(), PASSWORD, ip).andExpect(status().isTooManyRequests());

        timeMeter.advance(Duration.ofMinutes(15));

        login(user.getUsername(), PASSWORD, ip).andExpect(status().isOk());
    }

    private User createUser() {
        User user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("limit-" + UUID.randomUUID());
        user.setPassword(passwordEncoder.encode(PASSWORD));
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        return userRepository.save(user);
    }

    private ResultActions login(String username, String password, String clientIp) throws Exception {
        return mockMvc.perform(post("/auth/login")
            .with(request -> {
                request.setRemoteAddr(clientIp);
                return request;
            })
            .header(HttpHeaders.USER_AGENT, "LoginRateLimitTests")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"));
    }

    private static String randomIp() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        return "10." + random.nextInt(256) + "." + random.nextInt(256) + "." + random.nextInt(1, 255);
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
