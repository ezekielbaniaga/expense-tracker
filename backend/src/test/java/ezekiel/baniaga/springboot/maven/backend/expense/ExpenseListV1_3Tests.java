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
class ExpenseListV1_3Tests {

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

    private ResultActions list(String query) throws Exception {
        return mockMvc.perform(get("/api/expense" + query).header(HttpHeaders.AUTHORIZATION, token)
            .header("X-API-Version", "1.3"));
    }

    private void seedFour() {
        insert("b", "20.00", "TRANSPORT", "2026-02-01", 1);
        insert("a", "10.00", "FOOD", "2026-03-01", 2);
        insert("d", "40.00", "FOOD", "2026-01-01", 3);
        insert("c", "30.00", "BILLS", "2026-04-01", 4);
    }

    private void expectOrder(String query, String... descriptions) throws Exception {
        ResultActions r = list(query).andExpect(status().isOk());
        for (int i = 0; i < descriptions.length; i++) {
            r.andExpect(jsonPath("$.expenses[" + i + "].description").value(descriptions[i]));
        }
        r.andExpect(jsonPath("$.expenses.length()").value(descriptions.length));
    }

    @Test
    void defaultIsNewestDateFirstWithPagingFields() throws Exception {
        seedFour();
        expectOrder("", "c", "a", "b", "d");
        list("").andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(20))
            .andExpect(jsonPath("$.total").value(4)).andExpect(jsonPath("$.total_pages").value(1))
            .andExpect(jsonPath("$.total_amount").value(100.0))
            .andExpect(jsonPath("$.expenses[0].category").value("BILLS"))
            .andExpect(jsonPath("$.expenses[0].id").exists());
    }

    @Test
    void everySortFieldWorksBothWays() throws Exception {
        seedFour();
        expectOrder("?sort=date,asc", "d", "b", "a", "c");
        expectOrder("?sort=date,desc", "c", "a", "b", "d");
        expectOrder("?sort=amount,asc", "a", "b", "c", "d");
        expectOrder("?sort=amount,desc", "d", "c", "b", "a");
        expectOrder("?sort=description,asc", "a", "b", "c", "d");
        expectOrder("?sort=description,desc", "d", "c", "b", "a");
        expectOrder("?sort=createdAt,asc", "b", "a", "d", "c");
        expectOrder("?sort=createdAt,desc", "c", "d", "a", "b");
        // category: BILLS (c), FOOD (a, d), TRANSPORT (b); ties fall to createdAt desc
        expectOrder("?sort=category,asc", "c", "d", "a", "b");
        expectOrder("?sort=category,desc", "b", "d", "a", "c");
    }

    @Test
    void equalSortValuesFallBackToNewestCreatedThenHighestId() throws Exception {
        insert("old", "5.00", "FOOD", "2026-05-01", 1);
        insert("new", "5.00", "FOOD", "2026-05-01", 9);
        insert("same-1", "5.00", "FOOD", "2026-05-01", 5);
        insert("same-2", "5.00", "FOOD", "2026-05-01", 5);
        expectOrder("?sort=amount,asc", "new", "same-2", "same-1", "old");
        expectOrder("?sort=amount,desc", "new", "same-2", "same-1", "old");
    }

    @Test
    void legacyRowsWithoutDateOrAmountComeLastBothWays() throws Exception {
        insert("full-1", "10.00", "FOOD", "2026-01-01", 1);
        insert("full-2", "20.00", "FOOD", "2026-02-01", 2);
        jdbc.update("INSERT INTO expense (version, unique_id, owner_id, description, created_at) VALUES (0, ?, ?, 'legacy', CAST(? AS timestamp))",
            UUID.randomUUID(), ownerId, LocalDateTime.of(2026, 1, 1, 12, 0).toString());
        expectOrder("?sort=date,desc", "full-2", "full-1", "legacy");
        expectOrder("?sort=date,asc", "full-1", "full-2", "legacy");
        expectOrder("?sort=amount,desc", "full-2", "full-1", "legacy");
        expectOrder("?sort=amount,asc", "full-1", "full-2", "legacy");
        list("").andExpect(jsonPath("$.total").value(3)).andExpect(jsonPath("$.total_amount").value(30.0));
    }

    @Test
    void totalsCoverAllPagesAndPagesSplitTheList() throws Exception {
        seedFour();
        list("?size=3&sort=amount,asc").andExpect(status().isOk())
            .andExpect(jsonPath("$.expenses.length()").value(3))
            .andExpect(jsonPath("$.total").value(4)).andExpect(jsonPath("$.total_pages").value(2))
            .andExpect(jsonPath("$.total_amount").value(100.0)).andExpect(jsonPath("$.size").value(3));
        list("?size=3&page=1&sort=amount,asc").andExpect(status().isOk())
            .andExpect(jsonPath("$.expenses.length()").value(1))
            .andExpect(jsonPath("$.expenses[0].description").value("d"))
            .andExpect(jsonPath("$.page").value(1)).andExpect(jsonPath("$.total_amount").value(100.0));
        list("?size=3&page=5").andExpect(status().isOk())
            .andExpect(jsonPath("$.expenses.length()").value(0)).andExpect(jsonPath("$.total").value(4));
    }

    @Test
    void emptyListHasZeroTotals() throws Exception {
        list("").andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0))
            .andExpect(jsonPath("$.total_pages").value(0)).andExpect(jsonPath("$.total_amount").value(0));
    }

    @Test
    void pageBoundsAreChecked() throws Exception {
        list("?size=100").andExpect(status().isOk());
        list("?size=1").andExpect(status().isOk());
        for (String q : new String[] {"?page=-1", "?size=0", "?size=101"}) {
            list(q).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PAGE"));
        }
    }

    @Test
    void unknownSortIsRejected() throws Exception {
        for (String q : new String[] {"?sort=owner,asc", "?sort=date,sideways", "?sort=date,asc,x"}) {
            list(q).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_SORT"));
        }
    }

    @Test
    void otherUsersAndArchivedRowsAreAbsent() throws Exception {
        insert("mine", "10.00", "FOOD", "2026-01-01", 1);
        insert(ownerId, "archived", "99.00", "FOOD", "2026-01-02", 2, true);
        insert(newUser().getUniqueId(), "theirs", "50.00", "FOOD", "2026-01-03", 3, false);
        expectOrder("", "mine");
        list("").andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.total_amount").value(10.0));
    }
}
