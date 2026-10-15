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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {

    Optional<UserSession> findByRefreshTokenHash(String refreshTokenHash);

    // SELECT ... FOR UPDATE: a concurrent refresh with the same token waits here
    // until the first one commits, then no longer matches the rotated hash
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<UserSession> findForUpdateByRefreshTokenHash(String refreshTokenHash);

    // Ownership check: a session of another user is not found
    Optional<UserSession> findByUniqueIdAndUserId(UUID uniqueId, Long userId);

    // Active = not revoked and not expired. now is passed in from Java, like every other
    // timestamp here, instead of SQL now(), so the app clock decides what has expired.
    // id breaks ties so the order is stable when lastUsedAt is equal.
    @Query("""
        SELECT s FROM UserSession s
        WHERE s.user.id = :userId AND s.revokedAt IS NULL AND s.expiresAt > :now
        ORDER BY s.lastUsedAt DESC, s.id DESC
    """)
    List<UserSession> findActiveByUserId(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    // Ids of the user's active sessions, least recently used first, for the session cap.
    // id breaks ties so the oldest login goes first when lastUsedAt is equal.
    @Query("""
        SELECT s.id FROM UserSession s
        WHERE s.user.id = :userId AND s.revokedAt IS NULL AND s.expiresAt > :now
        ORDER BY s.lastUsedAt ASC, s.id ASC
    """)
    List<Long> findActiveIdsLeastRecentlyUsedFirst(@Param("userId") Long userId, @Param("now") LocalDateTime now);

    // Bulk revoke by id, keeping the first revocation time of already revoked sessions
    @Modifying
    @Query("""
        UPDATE UserSession s SET s.revokedAt = :revokedAt
        WHERE s.id IN :ids AND s.revokedAt IS NULL
    """)
    int revokeAll(@Param("ids") List<Long> ids, @Param("revokedAt") LocalDateTime revokedAt);

    // Keeps the first revocation time if the session was already revoked
    @Transactional
    @Modifying
    @Query("""
        UPDATE UserSession s SET s.revokedAt = :revokedAt
        WHERE s.id = :id AND s.revokedAt IS NULL
    """)
    int revoke(@Param("id") Long id, @Param("revokedAt") LocalDateTime revokedAt);

    // Ends every active session of a user in one statement. Already revoked
    // sessions keep their original revocation time.
    @Transactional
    @Modifying
    @Query("""
        UPDATE UserSession s SET s.revokedAt = :revokedAt
        WHERE s.user.id = :userId AND s.revokedAt IS NULL
    """)
    int revokeAllForUser(@Param("userId") Long userId, @Param("revokedAt") LocalDateTime revokedAt);

    // Like revokeAllForUser, but keeps the session with keepUniqueId. keepUniqueId must
    // not be null: unique_id <> NULL is never true in SQL, so nothing would be revoked.
    @Transactional
    @Modifying
    @Query("""
        UPDATE UserSession s SET s.revokedAt = :revokedAt
        WHERE s.user.id = :userId AND s.revokedAt IS NULL AND s.uniqueId <> :keepUniqueId
    """)
    int revokeAllForUserExcept(
        @Param("userId") Long userId,
        @Param("keepUniqueId") UUID keepUniqueId,
        @Param("revokedAt") LocalDateTime revokedAt);

    // Native Query as JPQL does not support LIMIT in DELETE.
    // used_refresh_tokens rows go with their session (ON DELETE CASCADE).
    @Modifying
    @Query(value = """
        DELETE FROM user_sessions
        WHERE id IN (
            SELECT id FROM user_sessions
            WHERE expires_at < :cutoff OR revoked_at < :cutoff
            LIMIT :limit
        )
    """, nativeQuery = true)
    int deleteEndedBefore(@Param("cutoff") LocalDateTime cutoff, @Param("limit") int limit);
}
