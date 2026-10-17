package ezekiel.baniaga.springboot.maven.backend.expense;

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
class ExpenseIdColumnTypeTests {

    @Autowired JdbcTemplate jdbcTemplate;

    // Expense.id is a Long, so the column and its sequence must be 64-bit (V13)
    @Test
    void expenseIdAndSequenceAreBigint() {
        String columnType = jdbcTemplate.queryForObject(
            "SELECT data_type FROM information_schema.columns "
                + "WHERE table_schema = current_schema() AND table_name = 'expense' AND column_name = 'id'",
            String.class);
        assertThat(columnType).isEqualTo("bigint");

        String sequenceType = jdbcTemplate.queryForObject(
            "SELECT data_type FROM information_schema.sequences "
                + "WHERE sequence_name = pg_get_serial_sequence('expense', 'id')::regclass::text",
            String.class);
        assertThat(sequenceType).isEqualTo("bigint");
    }
}
