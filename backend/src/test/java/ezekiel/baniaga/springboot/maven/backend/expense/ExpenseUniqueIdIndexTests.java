package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Same configuration as the other integration tests, so they share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ExpenseUniqueIdIndexTests {

    private static final String INSERT_EXPENSE =
        "INSERT INTO expense (unique_id, owner_id, description, amount, category, expense_date, created_at) "
            + "VALUES (?, ?, 'unique id test', 1.00, 'FOOD', CURRENT_DATE, CURRENT_TIMESTAMP)";

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired UserService userService;

    // unique_id is the public id every expense endpoint looks up by, so two rows
    // sharing one would make findByUniqueIdAndOwnerId throw (V16)
    @Test
    void duplicateUniqueIdIsRejected() {
        User owner = userService.createUser(
            "exp-uid-" + UUID.randomUUID().toString().substring(0, 8), "correct-horse-battery", Role.USER);
        UUID uniqueId = UUID.randomUUID();

        jdbcTemplate.update(INSERT_EXPENSE, uniqueId, owner.getUniqueId());

        assertThatThrownBy(() -> jdbcTemplate.update(INSERT_EXPENSE, uniqueId, owner.getUniqueId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    // V1's plain index_expense_unique_id is replaced by the unique index, not kept beside it
    @Test
    void uniqueIdHasOnlyTheUniqueIndex() {
        Map<String, String> uniqueIdIndexes = jdbcTemplate.queryForList(
                "SELECT indexname, indexdef FROM pg_indexes "
                    + "WHERE schemaname = current_schema() AND tablename = 'expense'")
            .stream()
            .filter(row -> ((String) row.get("indexdef")).contains("(unique_id)"))
            .collect(Collectors.toMap(
                row -> (String) row.get("indexname"),
                row -> (String) row.get("indexdef")));

        assertThat(uniqueIdIndexes).containsOnlyKeys("ux_expense_unique_id");
        assertThat(uniqueIdIndexes.get("ux_expense_unique_id")).startsWith("CREATE UNIQUE INDEX");
    }
}
