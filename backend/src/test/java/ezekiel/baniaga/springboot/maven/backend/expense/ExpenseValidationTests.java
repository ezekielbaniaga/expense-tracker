package ezekiel.baniaga.springboot.maven.backend.expense;

import com.jayway.jsonpath.JsonPath;
import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.expense.entity.Category;
import ezekiel.baniaga.springboot.maven.backend.expense.entity.Expense;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as ExpenseOwnershipTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ExpenseValidationTests {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired ExpenseRepository expenseRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;

    private User user;
    private String token;

    @BeforeEach
    void createUser() {
        user = new User();
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
    void createWithoutAmountOrDateIsRejected() throws Exception {
        mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"no amount\",\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.messages", hasItem("amount: must not be null")));

        mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"no date\",\"amount\":5,\"category\":\"FOOD\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.messages", hasItem("date: must not be null")));

        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, token))
            .andExpect(jsonPath("$.expenses", hasSize(0)));
    }

    @Test
    void updateWithoutAmountIsRejected() throws Exception {
        String body = mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"Lunch\",\"amount\":12.50,\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        mockMvc.perform(put("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":0,\"description\":\"Lunch\",\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.messages", hasItem("amount: must not be null")));
    }

    @Test
    void updateAndPatchWithoutVersionAreRejected() throws Exception {
        String body = mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"Lunch\",\"amount\":12.50,\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        mockMvc.perform(put("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"Lunch\",\"amount\":12.50,\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.messages", hasItem("version: must not be null")));

        mockMvc.perform(patch("/api/expense/" + id + "/description").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"Dinner\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.messages", hasItem("version: must not be null")));
    }

    @Test
    void controlCharactersInDescriptionAreRejectedOnCreateUpdateAndPatch() throws Exception {
        String body = mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"Lunch\",\"amount\":12.50,\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        for (String bad : new String[] {"a\\u0000b", "a\\u0001b", "a\\u001fb", "a\\u007fb",
            "a\\ud800b", "\\udc00", "x\\ud83d"}) {
            mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"description\":\"" + bad + "\",\"amount\":5,\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            mockMvc.perform(put("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":0,\"description\":\"" + bad + "\",\"amount\":5,\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            mockMvc.perform(patch("/api/expense/" + id + "/description").header(HttpHeaders.AUTHORIZATION, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"version\":0,\"description\":\"" + bad + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }

        // Nothing was stored: still just the original expense, unchanged
        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, token))
            .andExpect(jsonPath("$.expenses", hasSize(1)))
            .andExpect(jsonPath("$.expenses[0].description").value("Lunch"));
    }

    @Test
    void validSurrogatePairInDescriptionRoundTrips() throws Exception {
        String body = mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"Pizza \\ud83d\\ude00 \\ud842\\udfb7\",\"amount\":5,\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.description").value("Pizza \uD83D\uDE00 \uD842\uDFB7"))
            .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        mockMvc.perform(get("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.description").value("Pizza \uD83D\uDE00 \uD842\uDFB7"));
    }

    @Test
    void tabAndNewlineInDescriptionAreAccepted() throws Exception {
        mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"a\\tb\\nc\\r\\nd\",\"amount\":5,\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.description").value("a\tb\nc\r\nd"));
    }

    @Test
    void amountMustFitTheColumn() throws Exception {
        // NUMERIC(10,2): at most 8 digits before the point and 2 after
        createWithAmount("123456789.00").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        createWithAmount("12.345").andExpect(status().isBadRequest());

        createWithAmount("99999999.99").andExpect(status().isOk())
            .andExpect(jsonPath("$.amount").value(99999999.99));
    }

    private org.springframework.test.web.servlet.ResultActions createWithAmount(String amount) throws Exception {
        return mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"description\":\"x\",\"amount\":" + amount + ",\"category\":\"FOOD\",\"date\":\"2026-10-01\"}"));
    }

    @Test
    void v1_1TotalSkipsLegacyExpensesWithoutAmount() throws Exception {
        saveDirectly(null);
        saveDirectly(new BigDecimal("12.50"));

        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .header("X-API-Version", "1.1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.count").value(2))
            .andExpect(jsonPath("$.total_amount").value(12.50));
    }

    // Bypasses validation, like rows saved before amount was required
    private void saveDirectly(BigDecimal amount) {
        Expense expense = new Expense();
        expense.setUniqueId(UUID.randomUUID());
        expense.setOwnerId(user.getUniqueId());
        expense.setDescription("legacy");
        expense.setAmount(amount);
        expense.setCategory(Category.FOOD);
        expense.setExpenseDate(LocalDate.of(2026, 10, 1));
        expense.setCreatedAt(LocalDateTime.now());
        expenseRepository.save(expense);
    }
}
