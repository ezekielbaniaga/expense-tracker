package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

// Same configuration as the other integration tests, so they share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class UserUniqueIdIndexTests {

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired UserService userService;
    @Autowired UserRepository userRepository;

    // V9's uq_users_unique_id constraint has its own unique index, so V5's plain
    // index_users_unique_id only doubled the work on every user write (V15 drops it)
    @Test
    void uniqueIdHasOnlyTheUniqueIndex() {
        Map<String, String> uniqueIdIndexes = jdbcTemplate.queryForList(
                "SELECT indexname, indexdef FROM pg_indexes "
                    + "WHERE schemaname = current_schema() AND tablename = 'users'")
            .stream()
            .filter(row -> ((String) row.get("indexdef")).contains("(unique_id)"))
            .collect(Collectors.toMap(
                row -> (String) row.get("indexname"),
                row -> (String) row.get("indexdef")));

        assertThat(uniqueIdIndexes).containsOnlyKeys("uq_users_unique_id");
        assertThat(uniqueIdIndexes.get("uq_users_unique_id")).startsWith("CREATE UNIQUE INDEX");
    }

    @Test
    void lookupByUniqueIdStillWorks() {
        User user = userService.createUser(
            "uid-index-" + UUID.randomUUID().toString().substring(0, 8), "correct-horse-battery", Role.USER);

        assertThat(userRepository.findByUniqueId(user.getUniqueId()))
            .get().extracting(User::getId).isEqualTo(user.getId());
        assertThat(userRepository.findIdByUniqueId(user.getUniqueId())).contains(user.getId());
        assertThat(userRepository.findByUniqueId(UUID.randomUUID())).isEmpty();
    }
}
