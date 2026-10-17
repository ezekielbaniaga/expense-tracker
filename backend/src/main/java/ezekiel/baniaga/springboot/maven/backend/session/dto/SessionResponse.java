package ezekiel.baniaga.springboot.maven.backend.session.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Public view of a session. id is the unique_id, never the database id,
 * and the refresh token hash is never included. current is true for the
 * session the caller's access token belongs to (its sid claim).
 */
public record SessionResponse(
    UUID id,
    LocalDateTime createdAt,
    LocalDateTime lastUsedAt,
    LocalDateTime expiresAt,
    String userAgent,
    String ipAddress,
    boolean current
){}
