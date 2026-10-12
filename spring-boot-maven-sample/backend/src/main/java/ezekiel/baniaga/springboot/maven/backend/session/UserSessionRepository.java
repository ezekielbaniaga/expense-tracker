package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {

    Optional<UserSession> findByRefreshTokenHash(String refreshTokenHash);

    // Keeps the first revocation time if the session was already revoked
    @Transactional
    @Modifying
    @Query("""
        UPDATE UserSession s SET s.revokedAt = :revokedAt
        WHERE s.id = :id AND s.revokedAt IS NULL
    """)
    int revoke(@Param("id") Long id, @Param("revokedAt") LocalDateTime revokedAt);
}
