package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.expense.job.ExpenseCleanup;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ExpenseCleanupBatchTests {

    @Autowired ExpenseCleanup expenseCleanup;
    @Autowired UserService userService;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void oneRunDeletesMoreThanOneBatch() {
        User user = userService.createUser("cleanup-" + UUID.randomUUID(), "not-used-here", Role.USER);
        // 2.5 batches of 1,000; the old job deleted only 1,000 per call
        jdbcTemplate.update("""
            INSERT INTO expense (unique_id, owner_id, archived, archived_at)
            SELECT gen_random_uuid(), ?, TRUE, now() AT TIME ZONE 'UTC' - interval '40 days'
            FROM generate_series(1, 2500)
        """, user.getUniqueId());
        UUID recent = expense(user, true, "now() AT TIME ZONE 'UTC' - interval '1 day'");
        UUID active = expense(user, false, "NULL");

        expenseCleanup.cleanup();

        assertThat(count("archived = TRUE AND archived_at < now() AT TIME ZONE 'UTC' - interval '30 days'", user)).isZero();
        assertThat(exists(recent)).isTrue();
        assertThat(exists(active)).isTrue();
    }

    private UUID expense(User user, boolean archived, String archivedAtSql) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO expense (unique_id, owner_id, archived, archived_at) VALUES (?, ?, ?, "
            + archivedAtSql + ")", id, user.getUniqueId(), archived);
        return id;
    }

    private long count(String where, User user) {
        return jdbcTemplate.queryForObject(
            "SELECT count(*) FROM expense WHERE owner_id = ? AND " + where, Long.class, user.getUniqueId());
    }

    private boolean exists(UUID id) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM expense WHERE unique_id = ?", Integer.class, id) > 0;
    }
}
