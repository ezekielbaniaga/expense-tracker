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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ExpenseSummaryTests {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;
    @Autowired JdbcTemplate jdbc;

    private String token;
    private UUID ownerId;

    @BeforeEach
    void createUser() {
        User user = newUser();
        ownerId = user.getUniqueId();
        token = "Bearer " + jwtService.generateToken(mapper.toCustomUserDetails(user));
    }

    private User newUser() {
        User user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("user-" + UUID.randomUUID());
        user.setPassword("not-used");
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        return userRepository.save(user);
    }

    // created is the creation time in minutes of 2026-01-01 10:00, so tie-breaks are deterministic
    private void insert(UUID owner, String description, String amount, String category, String date, int created, boolean archived) {
        jdbc.update("INSERT INTO expense (version, unique_id, owner_id, description, amount, category, expense_date, created_at, archived) "
                + "VALUES (0, ?, ?, ?, CAST(? AS numeric), ?, CAST(? AS date), CAST(? AS timestamp), ?)",
            UUID.randomUUID(), owner, description, amount, category, date,
            LocalDateTime.of(2026, 1, 1, 10, 0).plusMinutes(created).toString(), archived);
    }

    private void insert(String description, String amount, String category, String date, int created) {
        insert(ownerId, description, amount, category, date, created, false);
    }

    private ResultActions summary(String query) throws Exception {
        return mockMvc.perform(get("/api/expense/summary" + query).header(HttpHeaders.AUTHORIZATION, token)
            .header("X-API-Version", "1.3"));
    }

    private void seed() {
        insert("a", "10.00", "FOOD", "2026-10-01", 1);
        insert("b", "30.50", "FOOD", "2026-10-15", 2);
        insert("c", "100.00", "BILLS", "2026-09-30", 3);
        insert("d", "5.00", null, "2026-10-20", 4);
        insert("e", null, "FOOD", "2026-10-21", 5);
        insert(ownerId, "gone", "999.00", "FOOD", "2026-10-10", 6, true);
        insert(newUser().getUniqueId(), "other", "888.00", "FOOD", "2026-10-10", 7, false);
    }

    @Test
    void summarizesAllTimeGroupedByTotalDescending() throws Exception {
        seed();
        summary("").andExpect(status().isOk())
            .andExpect(jsonPath("$.from").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.to").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.count").value(5))
            .andExpect(jsonPath("$.total_amount").value(145.5))
            .andExpect(jsonPath("$.by_category.length()").value(3))
            .andExpect(jsonPath("$.by_category[0].category").value("BILLS"))
            .andExpect(jsonPath("$.by_category[0].count").value(1))
            .andExpect(jsonPath("$.by_category[0].total_amount").value(100.0))
            .andExpect(jsonPath("$.by_category[1].category").value("FOOD"))
            .andExpect(jsonPath("$.by_category[1].count").value(3))
            .andExpect(jsonPath("$.by_category[1].total_amount").value(40.5))
            .andExpect(jsonPath("$.by_category[2].category").value(org.hamcrest.Matchers.nullValue()))
            .andExpect(jsonPath("$.by_category[2].count").value(1))
            .andExpect(jsonPath("$.by_category[2].total_amount").value(5.0));
    }

    @Test
    void equalTotalsAreOrderedByCategoryNameWithUncategorizedLast() throws Exception {
        insert("a", "10.00", "FOOD", "2026-10-01", 1);
        insert("b", "10.00", "BILLS", "2026-10-02", 2);
        summary("").andExpect(status().isOk())
            .andExpect(jsonPath("$.by_category[0].category").value("BILLS"))
            .andExpect(jsonPath("$.by_category[1].category").value("FOOD"));

        insert("c", "10.00", null, "2026-10-03", 3);
        summary("").andExpect(status().isOk())
            .andExpect(jsonPath("$.by_category.length()").value(3))
            .andExpect(jsonPath("$.by_category[0].category").value("BILLS"))
            .andExpect(jsonPath("$.by_category[1].category").value("FOOD"))
            .andExpect(jsonPath("$.by_category[2].category").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void rangeIsInclusiveAndEchoed() throws Exception {
        seed();
        summary("?from=2026-10-01&to=2026-10-15").andExpect(status().isOk())
            .andExpect(jsonPath("$.from").value("2026-10-01"))
            .andExpect(jsonPath("$.to").value("2026-10-15"))
            .andExpect(jsonPath("$.count").value(2))
            .andExpect(jsonPath("$.total_amount").value(40.5))
            .andExpect(jsonPath("$.by_category.length()").value(1));
        summary("?from=2026-10-20").andExpect(jsonPath("$.count").value(2))
            .andExpect(jsonPath("$.to").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void emptyGivesZeros() throws Exception {
        summary("").andExpect(status().isOk())
            .andExpect(jsonPath("$.count").value(0))
            .andExpect(jsonPath("$.total_amount").value(0))
            .andExpect(jsonPath("$.by_category.length()").value(0));
    }

    @Test
    void fromAfterToIsRejected() throws Exception {
        summary("?from=2026-10-02&to=2026-10-01").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_DATE_RANGE"));
    }

    @Test
    void malformedDateIsValidationError() throws Exception {
        summary("?from=2026-13-01").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void categoryFilterNarrowsTotalsAndBreakdown() throws Exception {
        seed();
        summary("?category=FOOD").andExpect(status().isOk())
            .andExpect(jsonPath("$.count").value(3))
            .andExpect(jsonPath("$.total_amount").value(40.5))
            .andExpect(jsonPath("$.by_category.length()").value(1))
            .andExpect(jsonPath("$.by_category[0].category").value("FOOD"));
        summary("?category=FOOD&category=BILLS").andExpect(jsonPath("$.count").value(4))
            .andExpect(jsonPath("$.total_amount").value(140.5))
            .andExpect(jsonPath("$.by_category.length()").value(2));
    }

    @Test
    void qFilterIsCaseInsensitiveSubstring() throws Exception {
        seed();
        insert("Coffee beans", "7.00", "FOOD", "2026-10-02", 8);
        summary("?q=COFFEE").andExpect(status().isOk())
            .andExpect(jsonPath("$.count").value(1))
            .andExpect(jsonPath("$.total_amount").value(7.0))
            .andExpect(jsonPath("$.by_category.length()").value(1));
    }

    @Test
    void amountFiltersAreInclusive() throws Exception {
        seed();
        summary("?minAmount=10").andExpect(jsonPath("$.count").value(3))
            .andExpect(jsonPath("$.total_amount").value(140.5));
        summary("?maxAmount=10").andExpect(jsonPath("$.count").value(2))
            .andExpect(jsonPath("$.total_amount").value(15.0));
        summary("?minAmount=10&maxAmount=30.50").andExpect(jsonPath("$.count").value(2))
            .andExpect(jsonPath("$.total_amount").value(40.5))
            .andExpect(jsonPath("$.by_category.length()").value(1));
    }

    @Test
    void combinedFiltersAgreeWithTheListTotal() throws Exception {
        seed();
        String query = "?category=FOOD&q=b&from=2026-10-01&to=2026-10-31&minAmount=1&maxAmount=50";
        summary(query).andExpect(status().isOk())
            .andExpect(jsonPath("$.from").value("2026-10-01"))
            .andExpect(jsonPath("$.count").value(1))
            .andExpect(jsonPath("$.total_amount").value(30.5))
            .andExpect(jsonPath("$.by_category.length()").value(1))
            .andExpect(jsonPath("$.by_category[0].total_amount").value(30.5));
        mockMvc.perform(get("/api/expense" + query).header(HttpHeaders.AUTHORIZATION, token)
                .header("X-API-Version", "1.3"))
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.total_amount").value(30.5));
        // a broader filter: breakdown sums to the list's total_amount
        String broad = "?category=FOOD&category=BILLS&minAmount=10";
        summary(broad).andExpect(jsonPath("$.total_amount").value(140.5))
            .andExpect(jsonPath("$.by_category[0].total_amount").value(100.0))
            .andExpect(jsonPath("$.by_category[1].total_amount").value(40.5));
        mockMvc.perform(get("/api/expense" + broad).header(HttpHeaders.AUTHORIZATION, token)
                .header("X-API-Version", "1.3"))
            .andExpect(jsonPath("$.total").value(3))
            .andExpect(jsonPath("$.total_amount").value(140.5));
    }

    @Test
    void invalidFiltersAreRejected() throws Exception {
        summary("?category=NOPE").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_CATEGORY"));
        summary("?minAmount=5&maxAmount=1").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_AMOUNT_RANGE"));
        summary("?q=" + "x".repeat(101)).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        summary("?minAmount=abc").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void summaryIsNotRoutedToUniqueId() throws Exception {
        summary("").andExpect(status().isOk()).andExpect(jsonPath("$.by_category").isArray());
    }

    @Test
    void servedOnEverySupportedVersion() throws Exception {
        for (String version : new String[] {"1.0", "1.1", "1.2", "1.3"}) {
            mockMvc.perform(get("/api/expense/summary").header(HttpHeaders.AUTHORIZATION, token)
                    .header("X-API-Version", version))
                .andExpect(status().isOk());
        }
    }
}
