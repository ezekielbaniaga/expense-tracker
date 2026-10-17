package ezekiel.baniaga.springboot.maven.backend.auth;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.session.RefreshTokenHasher;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionRepository;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import jakarta.servlet.http.Cookie;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Refresh and logout read the refresh_token cookie when the body has no token.
 * Cookie mode needs an allowed Origin; the body-based flow is unchanged.
 */
// Same configuration as LoginTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RefreshCookieTests {

    private static final String PASSWORD = "correct-horse-battery";
    private static final String COOKIE = "refresh_token";
    private static final String ALLOWED_ORIGIN = "http://localhost:5173";

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
    void refreshRotatesTheCookie() throws Exception {
        String first = loginWithCookie();
        Long sessionId = sessionOf(first).getId();

        MockHttpServletResponse response = cookieRequest("/auth/refresh", first, ALLOWED_ORIGIN)
            .andExpect(status().isOk())
            .andReturn().getResponse();

        Map<String, Object> body = JsonPath.read(response.getContentAsString(), "$");
        assertThat(body).doesNotContainKey("refreshToken");
        assertThat(body).containsKeys("accessToken", "accessTokenExpiresIn", "refreshTokenExpiresAt");

        String cookie = singleSetCookie(response);
        List<String> attributes = List.of(cookie.split(";\\s*"));
        assertThat(attributes).contains("HttpOnly", "Secure", "SameSite=Strict", "Path=/auth");
        String second = cookieValue(cookie);
        assertThat(second).isNotBlank().isNotEqualTo(first);
        assertThat(sessionOf(second).getId()).isEqualTo(sessionId);

        // The rotated cookie keeps working
        cookieRequest("/auth/refresh", second, ALLOWED_ORIGIN).andExpect(status().isOk());
    }

    @Test
    void replayedOldCookieRevokesTheSessionAndClearsTheCookie() throws Exception {
        String first = loginWithCookie();
        Long sessionId = sessionOf(first).getId();

        String second = cookieValue(singleSetCookie(
            cookieRequest("/auth/refresh", first, ALLOWED_ORIGIN)
                .andExpect(status().isOk()).andReturn().getResponse()));

        MockHttpServletResponse replay = cookieRequest("/auth/refresh", first, ALLOWED_ORIGIN)
            .andExpect(status().isUnauthorized())
            .andReturn().getResponse();
        assertCleared(singleSetCookie(replay));

        assertThat(userSessionRepository.findById(sessionId).orElseThrow().getRevokedAt()).isNotNull();
        cookieRequest("/auth/refresh", second, ALLOWED_ORIGIN).andExpect(status().isUnauthorized());
    }

    @Test
    void wrongOrMissingOriginIsForbidden() throws Exception {
        String raw = loginWithCookie();

        for (String path : List.of("/auth/refresh", "/auth/logout")) {
            cookieRequest(path, raw, "https://evil.example")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ORIGIN_NOT_ALLOWED"));
            cookieRequest(path, raw, null)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ORIGIN_NOT_ALLOWED"));
        }

        // Neither rotated nor revoked
        UserSession session = sessionOf(raw);
        assertThat(session.getRevokedAt()).isNull();
    }

    @Test
    void logoutRevokesAndClearsTheCookie() throws Exception {
        String raw = loginWithCookie();
        Long sessionId = sessionOf(raw).getId();

        MockHttpServletResponse response = cookieRequest("/auth/logout", raw, ALLOWED_ORIGIN)
            .andExpect(status().isNoContent())
            .andReturn().getResponse();
        assertCleared(singleSetCookie(response));

        assertThat(userSessionRepository.findById(sessionId).orElseThrow().getRevokedAt()).isNotNull();
    }

    @Test
    void neitherBodyNorCookieIsUnauthorized() throws Exception {
        for (String path : List.of("/auth/refresh", "/auth/logout")) {
            mockMvc.perform(post(path).header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
        }
    }

    @Test
    void bodyTokenWinsOverTheCookie() throws Exception {
        String bodyToken = loginWithBody();

        MockHttpServletResponse response = mockMvc.perform(post("/auth/refresh")
                .cookie(new Cookie(COOKIE, "not-a-real-token"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + bodyToken + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.refreshToken").isNotEmpty())
            .andReturn().getResponse();
        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
    }

    @Test
    void blankBodyStaysBadRequestEvenWithACookie() throws Exception {
        String raw = loginWithCookie();

        mockMvc.perform(post("/auth/refresh")
                .cookie(new Cookie(COOKIE, raw))
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void cookieValueIsValidatedLikeTheBody() throws Exception {
        for (String path : List.of("/auth/refresh", "/auth/logout")) {
            cookieRequest(path, "r".repeat(129), ALLOWED_ORIGIN)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            cookieRequest(path, " ", ALLOWED_ORIGIN)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        cookieRequest("/auth/refresh", "r".repeat(128), ALLOWED_ORIGIN)
            .andExpect(status().isUnauthorized());
    }

    private ResultActions cookieRequest(String path, String raw, String origin) throws Exception {
        MockHttpServletRequestBuilder request = post(path).cookie(new Cookie(COOKIE, raw));
        if (origin != null) {
            request.header(HttpHeaders.ORIGIN, origin);
        }
        return mockMvc.perform(request);
    }

    private String loginWithCookie() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(loginRequest()
                .header("X-Refresh-Token-Transport", "cookie"))
            .andExpect(status().isOk())
            .andReturn().getResponse();
        return cookieValue(singleSetCookie(response));
    }

    private String loginWithBody() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(loginRequest())
            .andExpect(status().isOk())
            .andReturn().getResponse();
        return JsonPath.read(response.getContentAsString(), "$.refreshToken");
    }

    private MockHttpServletRequestBuilder loginRequest() {
        return post("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + user.getUsername() + "\",\"password\":\"" + PASSWORD + "\"}");
    }

    private UserSession sessionOf(String raw) {
        return userSessionRepository.findByRefreshTokenHash(refreshTokenHasher.hash(raw)).orElseThrow();
    }

    private static String singleSetCookie(MockHttpServletResponse response) {
        List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(1);
        assertThat(cookies.get(0)).startsWith(COOKIE + "=");
        return cookies.get(0);
    }

    private static String cookieValue(String setCookie) {
        return setCookie.substring((COOKIE + "=").length(), setCookie.indexOf(';'));
    }

    private static void assertCleared(String setCookie) {
        assertThat(cookieValue(setCookie)).isEmpty();
        assertThat(List.of(setCookie.split(";\\s*"))).contains("Max-Age=0", "Path=/auth", "HttpOnly");
    }
}
