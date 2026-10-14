package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, Long> {

    // Case-insensitive to match the unique index on lower(username) (V11), which this
    // query can use. Derived IgnoreCase would compare upper() and skip the index.
    @Query("SELECT u FROM User u WHERE lower(u.username) = lower(:username)")
    Optional<User> findByUsername(@Param("username") String username);

    // The access token carries the unique_id, not the database id
    Optional<User> findByUniqueId(UUID uniqueId);
}
