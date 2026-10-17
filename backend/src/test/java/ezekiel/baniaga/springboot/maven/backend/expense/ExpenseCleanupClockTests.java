package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.TimeZone;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The archived expense cleanup cutoff is the UTC wall time from the Clock, whatever the
 * JVM zone is. With the clock at 2031-04-06T02:30Z and 7 days retention the cutoff is
 * 2031-03-30T02:30, inside the Europe/Berlin DST gap: bound through the JVM zone it would
 * arrive as 03:30. Own Spring context, because the clock is replaced.
 */
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, ExpenseCleanupClockTests.FixedClockConfig.class})
class ExpenseCleanupClockTests {

    @Autowired ExpenseService expenseService;
    @Autowired UserService userService;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void cleanupCutoffInADstGapOfTheJvmZoneIsNotShifted() {
        User user = userService.createUser("cleanup-" + UUID.randomUUID(), "not-used-here", Role.USER);
        UUID before = archivedExpense(user, "2031-03-30 02:15:00");
        UUID after = archivedExpense(user, "2031-03-30 02:45:00");

        TimeZone original = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone(ZoneId.of("Europe/Berlin")));
            expenseService.cleanupArchived(7, 1000);
        } finally {
            TimeZone.setDefault(original);
        }

        assertThat(exists(before)).isFalse();
        assertThat(exists(after)).isTrue();
    }

    private UUID archivedExpense(User user, String archivedAt) {
        UUID uniqueId = UUID.randomUUID();
        jdbcTemplate.update("""
            INSERT INTO expense (unique_id, owner_id, archived, archived_at)
            VALUES (?, ?, TRUE, CAST(? AS timestamp))
        """, uniqueId, user.getUniqueId(), archivedAt);
        return uniqueId;
    }

    private boolean exists(UUID uniqueId) {
        return jdbcTemplate.queryForObject(
            "SELECT count(*) FROM expense WHERE unique_id = ?", Integer.class, uniqueId) > 0;
    }

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(Instant.parse("2031-04-06T02:30:00Z"), ZoneOffset.UTC);
        }
    }
}
