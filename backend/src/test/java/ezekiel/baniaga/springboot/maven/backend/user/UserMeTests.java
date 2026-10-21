package ezekiel.baniaga.springboot.maven.backend.user;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as RegisterTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserMeTests {

    private static final String JWT_SECRET = "test-secret-that-is-at-least-32-bytes-long";
    private static final String PASSWORD = "correct-horse-battery";
    private static final String NEW_PASSWORD = "staple-battery-horse-2";

    @Autowired MockMvc mockMvc;
    @Autowired JsonMapper jsonMapper;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;

    @Test
    void meReturnsOwnProfileWithoutPassword() throws Exception {
        String username = uniqueName("Alice");
        register(username);
        Tokens tokens = login(username, PASSWORD);
        User user = userRepository.findByUsername(username).orElseThrow();

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(user.getUniqueId().toString()))
            .andExpect(jsonPath("$.username").value(username))
            .andExpect(jsonPath("$.role").value("USER"))
            .andExpect(jsonPath("$.createdAt").exists())
            .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void meWithoutTokenIs401() throws Exception {
        mockMvc.perform(get("/users/me"))
            .andExpect(status().isUnauthorized());
    }

    // A token signed with our key but without the uid claim (an older or hand-made one)
    // must be treated as invalid, not crash the filter with a 500
    @Test
    void meWithSignedTokenMissingUidIs401() throws Exception {
        Instant now = Instant.now();
        String token = Jwts.builder()
            .subject("alice")
            .claim("role", "USER")
            .issuer(JWTService.ISSUER)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(Duration.ofMinutes(15))))
            .signWith(Keys.hmacShaKeyFor(JWT_SECRET.getBytes(StandardCharsets.UTF_8)))
            .compact();

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
            .andExpect(status().isUnauthorized());
    }

    // 400, not 401: a client must not treat a typo in the current password as a logout
    @Test
    void wrongCurrentPasswordIs400AndChangesNothing() throws Exception {
        String username = uniqueName("Bob");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        changePassword(tokens, "not-the-password-at-all", NEW_PASSWORD)
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));

        User user = userRepository.findByUsername(username).orElseThrow();
        assertThat(passwordEncoder.matches(PASSWORD, user.getPassword())).isTrue();
        assertThat(user.getLastModified()).isNull();
        refresh(tokens.refreshToken()).andExpect(status().isOk());
    }

    @Test
    void weakNewPasswordIs400() throws Exception {
        String username = uniqueName("Carol");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        changePassword(tokens, PASSWORD, "short")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
        changePassword(tokens, PASSWORD, username.toUpperCase())
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PASSWORD"));
    }

    @Test
    void blankInputIsAValidationError() throws Exception {
        String username = uniqueName("Dave");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        changePassword(tokens, "", "")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void passwordChangeRevokesAllSessionsAndNewPasswordLogsIn() throws Exception {
        String username = uniqueName("Erin");
        register(username);
        Tokens first = login(username, PASSWORD);
        Tokens second = login(username, PASSWORD);

        changePassword(first, PASSWORD, NEW_PASSWORD)
            .andExpect(status().isNoContent());

        User user = userRepository.findByUsername(username).orElseThrow();
        assertThat(user.getLastModified()).isNotNull();

        // Every session ends, the one that made the change included
        refresh(first.refreshToken()).andExpect(status().isUnauthorized());
        refresh(second.refreshToken()).andExpect(status().isUnauthorized());

        loginRequest(username, PASSWORD).andExpect(status().isUnauthorized());
        Tokens fresh = login(username, NEW_PASSWORD);
        refresh(fresh.refreshToken()).andExpect(status().isOk());
    }

    @Test
    void meShowsNullDisplayNameUntilSet() throws Exception {
        String username = uniqueName("Nell");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").isEmpty());
    }

    // A plain USER, not only an admin: /users/me matches before the ADMIN-only /users/**
    @Test
    void userSetsTrimmedDisplayNameAndMeReturnsIt() throws Exception {
        String username = uniqueName("Fay");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        patchMe(tokens, "{\"displayName\": \"  Fay Baniaga \\t\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value(username))
            .andExpect(jsonPath("$.role").value("USER"))
            .andExpect(jsonPath("$.displayName").value("Fay Baniaga"))
            .andExpect(jsonPath("$.password").doesNotExist());

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, tokens.bearer()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").value("Fay Baniaga"));

        assertThat(userRepository.findByUsername(username).orElseThrow().getDisplayName())
            .isEqualTo("Fay Baniaga");
    }

    @Test
    void emptyOrBlankDisplayNameClearsIt() throws Exception {
        String username = uniqueName("Gil");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        patchMe(tokens, "{\"displayName\": \"Gil\"}").andExpect(status().isOk());
        patchMe(tokens, "{\"displayName\": \"\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").isEmpty());
        assertThat(userRepository.findByUsername(username).orElseThrow().getDisplayName()).isNull();

        patchMe(tokens, "{\"displayName\": \"Gil\"}").andExpect(status().isOk());
        patchMe(tokens, "{\"displayName\": \"   \"}").andExpect(status().isOk());
        assertThat(userRepository.findByUsername(username).orElseThrow().getDisplayName()).isNull();
    }

    @Test
    void displayNameAtTheLimitIsAccepted() throws Exception {
        String username = uniqueName("Hal");
        register(username);
        Tokens tokens = login(username, PASSWORD);
        // 100 characters, some outside the BMP: the limit counts characters, not UTF-16 units
        String name = "\uD83D\uDE00".repeat(50) + "a".repeat(50);

        patchMe(tokens, json(Map.of("displayName", name)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").value(name));
    }

    @Test
    void namesInOtherScriptsWithEmojiAndInnerSpacesAreAccepted() throws Exception {
        String username = uniqueName("Joe");
        register(username);
        Tokens tokens = login(username, PASSWORD);

        for (String name : new String[] {"Jos\u00E9", "\u674E\u5C0F\u9F8D", "Ana Mar\u00EDa", "Zed \uD83D\uDE00", "\uD842\uDFB7\uD842\uDFB7"}) {
            patchMe(tokens, json(Map.of("displayName", name)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value(name));
        }
    }

    @Test
    void invalidDisplayNameIs400AndChangesNothing() throws Exception {
        String username = uniqueName("Ivy");
        register(username);
        Tokens tokens = login(username, PASSWORD);
        patchMe(tokens, "{\"displayName\": \"Ivy\"}").andExpect(status().isOk());

        for (String body : new String[] {
            json(Map.of("displayName", "a".repeat(101))),
            json(Map.of("displayName", "Ivy\nAdmin")),
            json(Map.of("displayName", "Ivy\u0000")),
            json(Map.of("displayName", "Ivy\u007F")),
            json(Map.of("displayName", "Ivy\u202E")),
            json(Map.of("displayName", "Iv\u200By")),
            json(Map.of("displayName", "\uFEFF")),
            json(Map.of("displayName", "\u200B")),
            json(Map.of("displayName", "\u00A0")),
            json(Map.of("displayName", "\u00A0\u2007\u202F")),
            json(Map.of("displayName", "\u2028")),
            json(Map.of("displayName", "\u2029")),
            json(Map.of("displayName", "Ivy\u2028Admin")),
            // Escaped in the JSON text: a raw lone surrogate would be encoded to "?" before it is sent
            "{\"displayName\": \"a\\ud800b\"}",
            "{\"displayName\": \"\\udc00\"}",
            "{\"displayName\": \"Ivy\\ud83d\"}",
            "{\"displayName\": null}",
            "{}"
        }) {
            patchMe(tokens, body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_DISPLAY_NAME"))
                .andExpect(jsonPath("$.messages[0]").exists());
        }

        assertThat(userRepository.findByUsername(username).orElseThrow().getDisplayName()).isEqualTo("Ivy");
    }

    @Test
    void patchMeWithoutTokenIs401() throws Exception {
        mockMvc.perform(patch("/users/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\": \"x\"}"))
            .andExpect(status().isUnauthorized());
    }

    private record Tokens(String accessToken, String refreshToken) {
        String bearer() {
            return "Bearer " + accessToken;
        }
    }

    private void register(String username) throws Exception {
        mockMvc.perform(post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("username", username, "password", PASSWORD))))
            .andExpect(status().isCreated());
    }

    private ResultActions loginRequest(String username, String password) throws Exception {
        return mockMvc.perform(post("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("username", username, "password", password))));
    }

    private Tokens login(String username, String password) throws Exception {
        String body = loginRequest(username, password)
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return new Tokens(JsonPath.read(body, "$.accessToken"), JsonPath.read(body, "$.refreshToken"));
    }

    private ResultActions refresh(String refreshToken) throws Exception {
        return mockMvc.perform(post("/auth/refresh")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("refreshToken", refreshToken))));
    }

    private ResultActions changePassword(Tokens tokens, String current, String next) throws Exception {
        return mockMvc.perform(post("/users/me/password")
            .header(HttpHeaders.AUTHORIZATION, tokens.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(json(Map.of("currentPassword", current, "newPassword", next))));
    }

    private ResultActions patchMe(Tokens tokens, String body) throws Exception {
        return mockMvc.perform(patch("/users/me")
            .header(HttpHeaders.AUTHORIZATION, tokens.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(body));
    }

    private String json(Map<String, String> body) {
        return jsonMapper.writeValueAsString(body);
    }

    private static String uniqueName(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
