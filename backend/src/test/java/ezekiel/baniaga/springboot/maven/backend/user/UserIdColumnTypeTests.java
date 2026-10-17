package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

// Same configuration as the other integration tests, so they share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserIdColumnTypeTests {

    @Autowired JdbcTemplate jdbcTemplate;

    // User.id is a Long, so the column, its sequence and the foreign key
    // pointing at it must all be 64-bit (V12)
    @Test
    void userIdAndForeignKeyAreBigint() {
        assertThat(columnType("users", "id")).isEqualTo("bigint");
        assertThat(columnType("user_sessions", "user_id")).isEqualTo("bigint");

        String sequenceType = jdbcTemplate.queryForObject(
            "SELECT data_type FROM information_schema.sequences "
                + "WHERE sequence_name = pg_get_serial_sequence('users', 'id')::regclass::text",
            String.class);
        assertThat(sequenceType).isEqualTo("bigint");
    }

    private String columnType(String table, String column) {
        return jdbcTemplate.queryForObject(
            "SELECT data_type FROM information_schema.columns "
                + "WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?",
            String.class, table, column);
    }
}
