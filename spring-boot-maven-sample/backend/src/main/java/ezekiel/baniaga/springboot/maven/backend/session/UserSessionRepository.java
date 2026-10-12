package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {

    Optional<UserSession> findByRefreshTokenHash(String refreshTokenHash);

    // SELECT ... FOR UPDATE: a concurrent refresh with the same token waits here
    // until the first one commits, then no longer matches the rotated hash
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<UserSession> findForUpdateByRefreshTokenHash(String refreshTokenHash);

    // Keeps the first revocation time if the session was already revoked
    @Transactional
    @Modifying
    @Query("""
        UPDATE UserSession s SET s.revokedAt = :revokedAt
        WHERE s.id = :id AND s.revokedAt IS NULL
    """)
    int revoke(@Param("id") Long id, @Param("revokedAt") LocalDateTime revokedAt);
}
