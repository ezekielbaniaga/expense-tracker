package ezekiel.baniaga.springboot.maven.backend.user;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.common.GlobalExceptionHandler;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as RoleEnforcementTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AdminUserTests {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mockMvc;
    @Autowired JsonMapper jsonMapper;
    @Autowired UserService userService;
    @Autowired UserRepository userRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired ApplicationContext context;
    @Autowired GlobalExceptionHandler exceptionHandler;

    private User admin;
    private String adminBearer;

    @BeforeEach
    void createAdmin() {
        admin = userService.createUser(uniqueName("admin"), PASSWORD, Role.ADMIN);
        adminBearer = bearer(admin);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void userIsForbiddenOnEveryAdminEndpoint() throws Exception {
        User target = createUser(Role.USER);
        String userBearer = bearer(createUser(Role.USER));

        mockMvc.perform(get("/users").header(HttpHeaders.AUTHORIZATION, userBearer))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mockMvc.perform(get("/users/" + target.getUniqueId()).header(HttpHeaders.AUTHORIZATION, userBearer))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        patchUser(userBearer, target, Map.of("enabled", false))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mockMvc.perform(get("/users/" + target.getUniqueId() + "/sessions").header(HttpHeaders.AUTHORIZATION, userBearer))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    // The second layer: if a URL rule ever stops covering these methods, @PreAuthorize still
    // denies, and the AccessDeniedException thrown inside the controller (which goes through
    // GlobalExceptionHandler, not the security filter) is still a 403 ErrorResponse
    @Test
    void methodSecurityDeniesUserEvenWithoutTheUrlRule() throws Exception {
        CustomUserDetails user = mapper.toCustomUserDetails(createUser(Role.USER));
        SecurityContextHolder.getContext().setAuthentication(
            UsernamePasswordAuthenticationToken.authenticated(user, null, user.getAuthorities()));

        // The proxied bean, without the security filter chain in front of it. The resolver
        // fills @AuthenticationPrincipal as the full app does
        MockMvc noUrlRules = MockMvcBuilders
            .standaloneSetup(context.getBean("adminUserController"))
            .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
            .setControllerAdvice(exceptionHandler)
            .build();

        noUrlRules.perform(get("/users"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"))
            .andExpect(jsonPath("$.messages[0]").value("Access Denied"))
            .andExpect(jsonPath("$.timestamp").exists());
        noUrlRules.perform(get("/users/" + admin.getUniqueId()))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        noUrlRules.perform(get("/users/" + admin.getUniqueId() + "/sessions"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test
    void getUserByUniqueIdWithoutPassword() throws Exception {
        User target = createUser(Role.USER);

        mockMvc.perform(get("/users/" + target.getUniqueId()).header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(target.getUniqueId().toString()))
            .andExpect(jsonPath("$.username").value(target.getUsername()))
            .andExpect(jsonPath("$.role").value("USER"))
            .andExpect(jsonPath("$.enabled").value(true))
            .andExpect(jsonPath("$.version").value(0))
            .andExpect(jsonPath("$.password").doesNotExist());

        mockMvc.perform(get("/users/" + UUID.randomUUID()).header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    @Test
    void listIsPagedAndFiltered() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        User a = userService.createUser("list-" + tag + "-a", PASSWORD, Role.USER);
        userService.createUser("LIST-" + tag + "-b", PASSWORD, Role.USER);
        User c = userService.createUser("list-" + tag + "-c", PASSWORD, Role.USER);
        disable(c);

        // username filter is a case-insensitive substring match
        mockMvc.perform(get("/users").param("username", "list-" + tag)
                .param("size", "2").header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.users", hasSize(2)))
            .andExpect(jsonPath("$.users[0].id").value(a.getUniqueId().toString()))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(2))
            .andExpect(jsonPath("$.total").value(3))
            .andExpect(jsonPath("$.totalPages").value(2));

        mockMvc.perform(get("/users").param("username", "list-" + tag)
                .param("size", "2").param("page", "1").header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.users", hasSize(1)))
            .andExpect(jsonPath("$.users[0].id").value(c.getUniqueId().toString()));

        mockMvc.perform(get("/users").param("username", "list-" + tag)
                .param("enabled", "false").header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.users", hasSize(1)))
            .andExpect(jsonPath("$.users[0].id").value(c.getUniqueId().toString()))
            .andExpect(jsonPath("$.users[0].enabled").value(false));

        // LIKE wildcards in the filter are literal
        mockMvc.perform(get("/users").param("username", "list-" + tag + "%")
                .header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void invalidPagingIs400() throws Exception {
        mockMvc.perform(get("/users").param("page", "-1").header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PAGE"));
        mockMvc.perform(get("/users").param("size", "0").header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PAGE"));
        mockMvc.perform(get("/users").param("size", "101").header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_PAGE"));
    }

    @Test
    void patchPromotesAndSetsLastModified() throws Exception {
        User target = createUser(Role.USER);

        patchUser(adminBearer, target, Map.of("role", "ADMIN"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("ADMIN"))
            .andExpect(jsonPath("$.enabled").value(true))
            .andExpect(jsonPath("$.version").value(1))
            .andExpect(jsonPath("$.lastModified").exists());

        User saved = reload(target);
        assertThat(saved.getRole()).isEqualTo(Role.ADMIN);
        assertThat(saved.getLastModified()).isNotNull();
    }

    @Test
    void patchNeedsVersionAndAChange() throws Exception {
        User target = createUser(Role.USER);

        mockMvc.perform(patch("/users/" + target.getUniqueId())
                .header(HttpHeaders.AUTHORIZATION, adminBearer)
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonMapper.writeValueAsString(Map.of("enabled", false))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        patchUser(adminBearer, target, Map.of())
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("EMPTY_PATCH"));
    }

    @Test
    void staleVersionIs409() throws Exception {
        User target = createUser(Role.USER);
        patchUser(adminBearer, target, Map.of("enabled", false)).andExpect(status().isOk());

        // target still holds version 0
        patchUser(adminBearer, target, Map.of("enabled", true))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"));
    }

    @Test
    void disableRevokesSessions() throws Exception {
        User target = createUser(Role.USER);
        String refreshToken = loginRefreshToken(target);

        patchUser(adminBearer, target, Map.of("enabled", false))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(false));

        assertThat(activeSessions(target)).isZero();
        refresh(refreshToken).andExpect(status().isUnauthorized());
    }

    // The role is in the access token, so demotion ends every session; the next login gets USER
    @Test
    void demotedUsersRefreshTokenIsRejected() throws Exception {
        User target = createUser(Role.ADMIN);
        String refreshToken = loginRefreshToken(target);

        patchUser(adminBearer, target, Map.of("role", "USER"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("USER"));

        assertThat(activeSessions(target)).isZero();
        refresh(refreshToken).andExpect(status().isUnauthorized());
    }

    @Test
    void promotionKeepsSessions() throws Exception {
        User target = createUser(Role.USER);
        loginRefreshToken(target);

        patchUser(adminBearer, target, Map.of("role", "ADMIN")).andExpect(status().isOk());

        assertThat(activeSessions(target)).isEqualTo(1);
    }

    @Test
    void adminCannotDisableOrDemoteThemselves() throws Exception {
        createUser(Role.ADMIN); // not the last admin, so only the self rule can fire

        patchUser(adminBearer, admin, Map.of("enabled", false))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("CANNOT_MODIFY_SELF"));
        patchUser(adminBearer, admin, Map.of("role", "USER"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("CANNOT_MODIFY_SELF"));

        User saved = reload(admin);
        assertThat(saved.isEnabled()).isTrue();
        assertThat(saved.getRole()).isEqualTo(Role.ADMIN);
        assertThat(saved.getVersion()).isZero();
    }

    // A demoted or disabled admin's access token still says ADMIN until it expires, so the
    // service checks the caller against the database. Without that, B undoes its own demotion
    @Test
    void demotedAdminCannotPromoteThemselvesBack() throws Exception {
        User other = createUser(Role.ADMIN);
        String otherBearer = bearer(other);
        patchUser(adminBearer, other, Map.of("role", "USER")).andExpect(status().isOk());

        patchUser(otherBearer, reload(other), Map.of("role", "ADMIN"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        assertThat(reload(other).getRole()).isEqualTo(Role.USER);
    }

    @Test
    void disabledAdminCannotEnableThemselvesBack() throws Exception {
        User other = createUser(Role.ADMIN);
        String otherBearer = bearer(other);
        patchUser(adminBearer, other, Map.of("enabled", false)).andExpect(status().isOk());

        patchUser(otherBearer, reload(other), Map.of("enabled", true))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        assertThat(reload(other).isEnabled()).isFalse();
    }

    // The same stale token must not keep reading the user list either
    @Test
    void demotedOrDisabledAdminCannotReadUsers() throws Exception {
        User demoted = createUser(Role.ADMIN);
        User disabled = createUser(Role.ADMIN);
        String demotedBearer = bearer(demoted);
        String disabledBearer = bearer(disabled);
        patchUser(adminBearer, demoted, Map.of("role", "USER")).andExpect(status().isOk());
        patchUser(adminBearer, disabled, Map.of("enabled", false)).andExpect(status().isOk());

        for (String staleBearer : List.of(demotedBearer, disabledBearer)) {
            mockMvc.perform(get("/users").header(HttpHeaders.AUTHORIZATION, staleBearer))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
            mockMvc.perform(get("/users/" + admin.getUniqueId()).header(HttpHeaders.AUTHORIZATION, staleBearer))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }
    }

    // Used to be the LAST_ADMIN case; a caller who is no longer an enabled admin is now refused first
    @Test
    void disabledAdminCannotRemoveTheLastAdmin() throws Exception {
        onlyThisTestsAdminsEnabled();
        User other = createUser(Role.ADMIN);
        String otherBearer = bearer(other);

        // Two enabled admins, so this one passes and leaves `admin` as the last
        patchUser(adminBearer, other, Map.of("enabled", false)).andExpect(status().isOk());

        patchUser(otherBearer, admin, Map.of("role", "USER"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        patchUser(otherBearer, admin, Map.of("enabled", false))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        User saved = reload(admin);
        assertThat(saved.isEnabled()).isTrue();
        assertThat(saved.getRole()).isEqualTo(Role.ADMIN);
    }

    // Without the lock both transactions see both admins and both demotions commit. With it the
    // second waits, then finds its caller is no longer an enabled admin and is refused
    @Test
    void twoAdminsDemotingEachOtherAtOnceLeaveOneAdmin() throws Exception {
        for (int round = 0; round < 5; round++) {
            jdbcTemplate.update("UPDATE users SET enabled = FALSE WHERE role = 'ADMIN'");
            User a = createUser(Role.ADMIN);
            User b = createUser(Role.ADMIN);
            String aBearer = bearer(a);
            String bBearer = bearer(b);

            CountDownLatch start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            try {
                List<Future<Integer>> results = new ArrayList<>();
                results.add(pool.submit(() -> {
                    start.await();
                    return patchUser(aBearer, b, Map.of("role", "USER")).andReturn().getResponse().getStatus();
                }));
                results.add(pool.submit(() -> {
                    start.await();
                    return patchUser(bBearer, a, Map.of("role", "USER")).andReturn().getResponse().getStatus();
                }));
                start.countDown();

                List<Integer> statuses = new ArrayList<>();
                for (Future<Integer> result : results) {
                    statuses.add(result.get());
                }
                assertThat(statuses).containsExactlyInAnyOrder(200, 403);
            } finally {
                pool.shutdownNow();
            }

            long admins = List.of(reload(a), reload(b)).stream()
                .filter(u -> u.getRole() == Role.ADMIN && u.isEnabled()).count();
            assertThat(admins).isEqualTo(1);
        }
    }

    private ResultActions patchUser(String bearer, User target, Map<String, Object> changes) throws Exception {
        Map<String, Object> body = new HashMap<>(changes);
        body.put("version", target.getVersion());
        return mockMvc.perform(patch("/users/" + target.getUniqueId())
            .header(HttpHeaders.AUTHORIZATION, bearer)
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonMapper.writeValueAsString(body)));
    }

    private String loginRefreshToken(User user) throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(jsonMapper.writeValueAsString(
                    Map.of("username", user.getUsername(), "password", PASSWORD))))
            .andExpect(status().isOk())
            .andReturn();
        return JsonPath.read(result.getResponse().getContentAsString(), "$.refreshToken");
    }

    private ResultActions refresh(String refreshToken) throws Exception {
        return mockMvc.perform(post("/auth/refresh")
            .contentType(MediaType.APPLICATION_JSON)
            .content(jsonMapper.writeValueAsString(Map.of("refreshToken", refreshToken))));
    }

    private int activeSessions(User user) {
        return jdbcTemplate.queryForObject(
            "SELECT count(*) FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL",
            Integer.class, user.getId().intValue());
    }

    // Other tests leave enabled admins behind; the last-admin rule counts all of them
    private void onlyThisTestsAdminsEnabled() {
        jdbcTemplate.update("UPDATE users SET enabled = FALSE WHERE role = 'ADMIN' AND id <> ?",
            admin.getId().intValue());
    }

    private void disable(User user) {
        jdbcTemplate.update("UPDATE users SET enabled = FALSE WHERE id = ?", user.getId().intValue());
    }

    private User createUser(Role role) {
        return userService.createUser(uniqueName(role.name().toLowerCase()), PASSWORD, role);
    }

    private User reload(User user) {
        return userRepository.findById(user.getId()).orElseThrow();
    }

    private String bearer(User user) {
        return "Bearer " + jwtService.generateToken(mapper.toCustomUserDetails(user));
    }

    private static String uniqueName(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
