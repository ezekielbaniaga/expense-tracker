package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as ExpenseOwnershipTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class RoleEnforcementTests {

    @Autowired MockMvc mockMvc;
    @Autowired UserService userService;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;

    private String user;
    private String admin;

    @BeforeEach
    void createUsers() {
        user = bearer(userService.createUser("user-" + UUID.randomUUID(), "not-used", Role.USER));
        admin = bearer(userService.createUser("admin-" + UUID.randomUUID(), "not-used", Role.ADMIN));
    }

    @Test
    void userIsForbiddenOnAdminPaths() throws Exception {
        for (String path : List.of("/users", "/users/some-id")) {
            mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, user))
                .andExpect(status().isForbidden());
        }
    }

    // No /users endpoints exist yet, so getting past the rule means a 404, not a 403
    @Test
    void adminGetsPastTheAdminRule() throws Exception {
        for (String path : List.of("/users", "/users/some-id")) {
            mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isNotFound());
        }
    }

    // /users/me must match before /users/** or every regular user would be locked out of it
    @Test
    void userGetsPastTheRuleForOwnProfile() throws Exception {
        for (String path : List.of("/users/me", "/users/me/password")) {
            mockMvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, user))
                .andExpect(status().isNotFound());
        }
    }

    @Test
    void anonymousIsUnauthorizedOnUserPaths() throws Exception {
        for (String path : List.of("/users", "/users/me")) {
            mockMvc.perform(get(path))
                .andExpect(status().isUnauthorized());
        }
    }

    private String bearer(User u) {
        return "Bearer " + jwtService.generateToken(mapper.toCustomUserDetails(u));
    }
}
