package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * What a login gets back from createSession: the raw refresh token for the
 * client, the session's public id for the access token's sid claim, and the
 * user as read under the row lock, so the access token carries the current role,
 * and when the session ends (its expires_at, UTC).
 */
public record CreatedSession(
        String rawRefreshToken,
        UUID sessionId,
        CustomUserDetails userDetails,
        LocalDateTime expiresAt
) {
}
