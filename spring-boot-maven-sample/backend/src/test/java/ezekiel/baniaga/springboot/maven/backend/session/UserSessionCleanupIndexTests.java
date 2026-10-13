package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

// Same configuration as UserSessionCleanupTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserSessionCleanupIndexTests {

    @Autowired JdbcTemplate jdbcTemplate;

    // deleteEndedBefore filters on expires_at OR revoked_at; one index per column
    // lets Postgres combine them with a BitmapOr instead of scanning the table
    @Test
    void sessionCleanupColumnsAreIndexed() {
        Map<String, String> indexes = jdbcTemplate.queryForList(
                "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user_sessions'")
            .stream()
            .collect(Collectors.toMap(
                row -> (String) row.get("indexname"),
                row -> (String) row.get("indexdef")));

        assertThat(indexes).containsKeys(
            "idx_user_sessions_expires_at", "idx_user_sessions_revoked_at");
        assertThat(indexes.get("idx_user_sessions_expires_at")).contains("(expires_at)");
        assertThat(indexes.get("idx_user_sessions_revoked_at"))
            .contains("(revoked_at)")
            .contains("WHERE (revoked_at IS NOT NULL)");
    }
}
