package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.session.entity.UsedRefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UsedRefreshTokenRepository extends JpaRepository<UsedRefreshToken, String> {

    /**
     * Deletes all but the newest keep used token hashes of the session.
     * Native SQL because JPQL has no LIMIT in subqueries. Uses the
     * session_id index (V8). flushAutomatically so a just-saved hash is
     * in the table before it is counted.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
        DELETE FROM used_refresh_tokens
        WHERE session_id = :sessionId
          AND token_hash NOT IN (
              SELECT token_hash FROM used_refresh_tokens
              WHERE session_id = :sessionId
              ORDER BY used_at DESC, token_hash DESC
              LIMIT :keep
          )
    """, nativeQuery = true)
    int deleteAllButNewest(@Param("sessionId") Long sessionId, @Param("keep") int keep);
}
