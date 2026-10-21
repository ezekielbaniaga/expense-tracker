package ezekiel.baniaga.springboot.maven.backend.expense;

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
import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as ExpenseValidationTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ExpenseApiVersionTests {

    private static final List<String> VERSIONS = List.of("1.0", "1.1", "1.2", "1.3");

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;

    private String token;

    @BeforeEach
    void createUser() {
        User user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("user-" + UUID.randomUUID());
        user.setPassword("not-used");
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.save(user);
        token = "Bearer " + jwtService.generateToken(mapper.toCustomUserDetails(user));
    }

    @Test
    void createIsServedOnEverySupportedVersion() throws Exception {
        for (String version : VERSIONS) {
            mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                    .header("X-API-Version", version)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"description\":\"Lunch\",\"amount\":12.50,\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
                .andExpect(status().isOk());
        }
    }

    @Test
    void categoriesAreServedOnEverySupportedVersion() throws Exception {
        for (String version : VERSIONS) {
            mockMvc.perform(get("/api/expense/categories").header(HttpHeaders.AUTHORIZATION, token)
                    .header("X-API-Version", version))
                .andExpect(status().isOk());
        }
    }

    @Test
    void listReturnsTheShapeOfTheRequestedVersion() throws Exception {
        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .header("X-API-Version", "1.0"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.expenses").isArray())
            .andExpect(jsonPath("$.total_amount").doesNotExist());

        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .header("X-API-Version", "1.1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total_amount").exists())
            .andExpect(jsonPath("$.expenses[0].category").doesNotExist());
    }

    @Test
    void list1_2ReturnsCategoryDateAndVersionNewestDateFirst() throws Exception {
        createExpense("Old", "2026-09-01");
        createExpense("Newer first", "2026-10-01");
        createExpense("Newer second", "2026-10-01");

        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .header("X-API-Version", "1.2"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.count").value(3))
            .andExpect(jsonPath("$.total_amount").value(37.5))
            .andExpect(jsonPath("$.expenses[0].description").value("Newer second"))
            .andExpect(jsonPath("$.expenses[1].description").value("Newer first"))
            .andExpect(jsonPath("$.expenses[2].description").value("Old"))
            .andExpect(jsonPath("$.expenses[0].category").value("FOOD"))
            .andExpect(jsonPath("$.expenses[0].date").value("2026-10-01"))
            .andExpect(jsonPath("$.expenses[0].version").value(0))
            .andExpect(jsonPath("$.expenses[0].id").exists())
            .andExpect(jsonPath("$.expenses[0].amount").value(12.5));

        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .header("X-API-Version", "1.1"))
            .andExpect(jsonPath("$.expenses[0].category").doesNotExist());
    }

    private void createExpense(String description, String date) throws Exception {
        mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .header("X-API-Version", "1.0")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"" + description + "\",\"amount\":12.50,\"category\":\"FOOD\",\"date\":\"" + date + "\"}"))
            .andExpect(status().isOk());
    }

    @Test
    void unversionedEndpointsAreServedOnEverySupportedVersion() throws Exception {
        for (String version : VERSIONS) {
            mockMvc.perform(get("/api/expense/archived").header(HttpHeaders.AUTHORIZATION, token)
                    .header("X-API-Version", version))
                .andExpect(status().isOk());
        }
    }

    @Test
    void unservedVersionsAreRejected() throws Exception {
        for (String version : List.of("1.4", "2.0", "2.2")) {
            mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                    .header("X-API-Version", version))
                .andExpect(status().is4xxClientError());
        }
    }
}
