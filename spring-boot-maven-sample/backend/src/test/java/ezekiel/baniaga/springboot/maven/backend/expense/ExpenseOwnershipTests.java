package ezekiel.baniaga.springboot.maven.backend.expense;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as RefreshTokenReuseTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ExpenseOwnershipTests {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;

    private String alice;
    private String bob;

    @BeforeEach
    void createUsers() {
        alice = bearer(createUser());
        bob = bearer(createUser());
    }

    @Test
    void usersOnlySeeTheirOwnExpenses() throws Exception {
        String id = createExpense(alice);

        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.expenses", hasSize(1)))
            .andExpect(jsonPath("$.expenses[0].id").value(id));

        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, bob))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.expenses", hasSize(0)));
    }

    @Test
    void otherUsersExpenseLooksNotFound() throws Exception {
        String id = createExpense(alice);

        mockMvc.perform(get("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, bob))
            .andExpect(status().isNotFound());

        mockMvc.perform(put("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, bob)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"version":0,"description":"Hijacked","amount":1,"category":"FOOD","date":"2026-10-01"}
                    """))
            .andExpect(status().isNotFound());

        mockMvc.perform(patch("/api/expense/" + id + "/description").header(HttpHeaders.AUTHORIZATION, bob)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":0,\"description\":\"Hijacked\"}"))
            .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/expense/" + id + "?version=0").header(HttpHeaders.AUTHORIZATION, bob))
            .andExpect(status().isNotFound());

        // Untouched for the owner
        mockMvc.perform(get("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.description").value("Lunch"));
    }

    @Test
    void archivedListIsScopedToOwner() throws Exception {
        String id = createExpense(alice);
        mockMvc.perform(delete("/api/expense/" + id + "?version=0").header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/expense/archived").header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(jsonPath("$.expenses", hasSize(1)));

        mockMvc.perform(get("/api/expense/archived").header(HttpHeaders.AUTHORIZATION, bob))
            .andExpect(jsonPath("$.expenses", hasSize(0)));
    }

    @Test
    void deleteRequiresCurrentVersion() throws Exception {
        String id = createExpense(alice);

        mockMvc.perform(delete("/api/expense/" + id + "?version=7").header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"));

        mockMvc.perform(delete("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(status().isBadRequest());

        // Still active after the rejected deletes
        mockMvc.perform(get("/api/expense/archived").header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(jsonPath("$.expenses", hasSize(0)));
    }

    @Test
    void deletingArchivedExpenseIsRejected() throws Exception {
        String id = createExpense(alice);
        mockMvc.perform(delete("/api/expense/" + id + "?version=0").header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(status().isNoContent());

        // Archiving bumped the version to 1; even with the right version it stays archived once
        mockMvc.perform(delete("/api/expense/" + id + "?version=1").header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("MODIFY_ARCHIVED"));
    }

    @Test
    void invalidBearerTokenIsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
            .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, alice + "tampered"))
            .andExpect(status().isUnauthorized());
    }

    private String createExpense(String token) throws Exception {
        String body = mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"description":"Lunch","amount":12.50,"category":"FOOD","date":"2026-10-01"}
                    """))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        return JsonPath.read(body, "$.id");
    }

    private User createUser() {
        User user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("user-" + UUID.randomUUID());
        user.setPassword("not-used");
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        return userRepository.save(user);
    }

    private String bearer(User user) {
        return "Bearer " + jwtService.generateToken(mapper.toCustomUserDetails(user));
    }
}
