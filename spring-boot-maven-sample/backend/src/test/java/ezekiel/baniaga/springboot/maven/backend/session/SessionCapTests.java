package ezekiel.baniaga.springboot.maven.backend.session;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as SessionListTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class SessionCapTests {

    private static final String PASSWORD = "correct-horse-battery";
    private static final int CAP = 10;

    @Autowired MockMvc mockMvc;
    @Autowired JsonMapper jsonMapper;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired UserRepository userRepository;
    @Autowired CustomUserDetailsMapper customUserDetailsMapper;
    @Autowired UserSessionService userSessionService;
    @Autowired JWTService jwtService;

    @Test
    void eleventhLoginRevokesTheLeastRecentlyUsedSession() throws Exception {
        String username = register("Cap");
        List<Tokens> logins = new ArrayList<>();
        for (int i = 0; i < CAP; i++) {
            logins.add(login(username));
        }
        // Not the oldest login: the cap goes by last use, not by creation
        Tokens leastRecentlyUsed = logins.get(4);
        jdbcTemplate.update("UPDATE user_sessions SET last_used_at = ? WHERE unique_id = ?",
            LocalDateTime.now().minusHours(1), sidOf(leastRecentlyUsed));

        Tokens eleventh = login(username);

        assertThat(activeSessions(username)).isEqualTo(CAP);
        refresh(leastRecentlyUsed.refreshToken()).andExpect(status().isUnauthorized());
        refresh(logins.get(0).refreshToken()).andExpect(status().isOk());
        refresh(eleventh.refreshToken()).andExpect(status().isOk());
    }

    @Test
    void loginsBelowTheCapRevokeNothing() throws Exception {
        String username = register("Below");
        for (int i = 0; i < CAP; i++) {
            login(username);
        }

        assertThat(activeSessions(username)).isEqualTo(CAP);
        assertThat(revokedSessions(username)).isZero();
    }

    // Without the user row lock each login counts before the others insert,
    // so all of them see room under the cap
    @Test
    void concurrentLoginsNeverExceedTheCap() throws Exception {
        String username = register("Race");
        CustomUserDetails userDetails = customUserDetailsMapper.toCustomUserDetails(
            userRepository.findByUsername(username).orElseThrow());
        int threads = 20;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);

        try {
            List<Future<CreatedSession>> results = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return userSessionService.createSession(userDetails, "test", "127.0.0.1");
                }));
            }
            start.countDown();

            // Every login succeeds; older sessions are revoked instead
            for (Future<CreatedSession> result : results) {
                assertThat(result.get(30, TimeUnit.SECONDS)).isNotNull();
            }

            assertThat(activeSessions(username)).isEqualTo(CAP);
            assertThat(revokedSessions(username)).isEqualTo(threads - CAP);
        } finally {
            pool.shutdownNow();
        }
    }

    private record Tokens(String accessToken, String refreshToken) {}

    private Integer activeSessions(String username) {
        return jdbcTemplate.queryForObject("""
            SELECT count(*) FROM user_sessions s JOIN users u ON u.id = s.user_id
            WHERE u.username = ? AND s.revoked_at IS NULL AND s.expires_at > now()
            """, Integer.class, username);
    }

    private Integer revokedSessions(String username) {
        return jdbcTemplate.queryForObject("""
            SELECT count(*) FROM user_sessions s JOIN users u ON u.id = s.user_id
            WHERE u.username = ? AND s.revoked_at IS NOT NULL
            """, Integer.class, username);
    }

    private UUID sidOf(Tokens tokens) {
        return jwtService.extractPrincipal(tokens.accessToken()).sessionId();
    }

    private ResultActions refresh(String refreshToken) throws Exception {
        return mockMvc.perform(post("/auth/refresh")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("refreshToken", refreshToken))));
    }

    private String register(String prefix) throws Exception {
        String username = prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
        mockMvc.perform(post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", username, "password", PASSWORD))))
            .andExpect(status().isCreated());
        return username;
    }

    private Tokens login(String username) throws Exception {
        String body = mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", username, "password", PASSWORD))))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return new Tokens(JsonPath.read(body, "$.accessToken"), JsonPath.read(body, "$.refreshToken"));
    }

    private String json(Map<String, String> body) {
        return jsonMapper.writeValueAsString(body);
    }
}
