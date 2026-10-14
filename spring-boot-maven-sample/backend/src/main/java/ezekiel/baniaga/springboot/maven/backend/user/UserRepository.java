package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {

    // Case-insensitive to match the unique index on lower(username) (V11), which this
    // query can use. Derived IgnoreCase would compare upper() and skip the index.
    @Query("SELECT u FROM User u WHERE lower(u.username) = lower(:username)")
    Optional<User> findByUsername(@Param("username") String username);

    // The access token carries the unique_id, not the database id
    Optional<User> findByUniqueId(UUID uniqueId);

    // SELECT ... FOR UPDATE on every enabled admin, so two admins removing each other
    // at once can't both count two. The second waits, and PostgreSQL re-checks the WHERE
    // on the rows the first changed, so it counts one. Ordered so both lock in the same order.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.role = ezekiel.baniaga.springboot.maven.backend.user.entity.Role.ADMIN AND u.enabled = TRUE ORDER BY u.id")
    List<User> lockEnabledAdmins();
}
