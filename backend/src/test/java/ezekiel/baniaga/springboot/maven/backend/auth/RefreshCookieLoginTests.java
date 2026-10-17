package ezekiel.baniaga.springboot.maven.backend.auth;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.session.RefreshTokenHasher;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionRepository;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Login with X-Refresh-Token-Transport: cookie puts the refresh token in an
 * HttpOnly cookie and leaves it out of the body; without the header the body
 * carries it as before (Bruno and the other tests rely on that).
 */
// Same configuration as LoginTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RefreshCookieLoginTests {

    private static final String PASSWORD = "correct-horse-battery";
    private static final Pattern MAX_AGE = Pattern.compile("(?i)Max-Age=(\\d+)");

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired UserSessionRepository userSessionRepository;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @Autowired PasswordEncoder passwordEncoder;

    private User user;

    @BeforeEach
    void createUser() {
        user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("cookie-" + UUID.randomUUID());
        user.setPassword(passwordEncoder.encode(PASSWORD));
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.save(user);
    }

    @Test
    void cookieModeSetsTheCookieAndLeavesTheTokenOutOfTheBody() throws Exception {
        LocalDateTime before = LocalDateTime.now(ZoneOffset.UTC);
        MockHttpServletResponse response = login(true);
        LocalDateTime after = LocalDateTime.now(ZoneOffset.UTC);

        Map<String, Object> body = JsonPath.read(response.getContentAsString(), "$");
        assertThat(body).doesNotContainKey("refreshToken");
        assertThat(body).containsKeys("accessToken", "accessTokenExpiresIn", "refreshTokenExpiresAt");

        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(1);
        String cookie = cookies.get(0);
        assertThat(cookie).startsWith("refresh_token=");
        String raw = cookie.substring("refresh_token=".length(), cookie.indexOf(';'));
        assertThat(raw).isNotBlank();

        List<String> attributes = List.of(cookie.split(";\\s*"));
        assertThat(attributes).contains("HttpOnly", "Secure", "SameSite=Strict", "Path=/auth");

        // The cookie holds a live session's refresh token and lasts as long as the session
        UserSession session = userSessionRepository
            .findByRefreshTokenHash(refreshTokenHasher.hash(raw)).orElseThrow();
        assertThat(LocalDateTime.parse(JsonPath.read(response.getContentAsString(), "$.refreshTokenExpiresAt")))
            .isEqualTo(session.getExpiresAt());

        Matcher maxAge = MAX_AGE.matcher(cookie);
        assertThat(maxAge.find()).isTrue();
        long seconds = Long.parseLong(maxAge.group(1));
        long upper = Duration.between(before, session.getExpiresAt()).getSeconds();
        long lower = Duration.between(after, session.getExpiresAt()).getSeconds() - 1;
        assertThat(seconds).isBetween(lower, upper);
        assertThat(seconds).isPositive();
    }

    @Test
    void bodyModeIsUnchanged() throws Exception {
        MockHttpServletResponse response = login(false);

        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
        String raw = JsonPath.read(response.getContentAsString(), "$.refreshToken");
        assertThat(userSessionRepository.findByRefreshTokenHash(refreshTokenHasher.hash(raw))).isPresent();
    }

    private MockHttpServletResponse login(boolean cookieMode) throws Exception {
        MockHttpServletRequestBuilder request = post("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + user.getUsername() + "\",\"password\":\"" + PASSWORD + "\"}");
        if (cookieMode) {
            request.header("X-Refresh-Token-Transport", "cookie");
        }
        return mockMvc.perform(request)
            .andExpect(status().isOk())
            .andReturn().getResponse();
    }
}
