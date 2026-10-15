package ezekiel.baniaga.springboot.maven.backend.auth.security;

import java.util.UUID;

/**
 * @param sessionId the {@code sid} claim: the session's public unique id, or null for
 *                  tokens issued without one (e.g. before the claim existed)
 */
public record JWTPrincipal (
    UUID userId,
    String username,
    String role,
    UUID sessionId
){}
