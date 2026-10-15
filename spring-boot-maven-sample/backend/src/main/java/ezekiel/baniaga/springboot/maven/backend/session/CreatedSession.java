package ezekiel.baniaga.springboot.maven.backend.session;

import java.util.UUID;

/**
 * What a login gets back from createSession: the raw refresh token for the
 * client, and the session's public id for the access token's sid claim.
 */
public record CreatedSession(
        String rawRefreshToken,
        UUID sessionId
) {
}
