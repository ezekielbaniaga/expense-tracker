package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;

import java.util.UUID;

/**
 * Holds plain user details instead of the User entity, so callers never
 * touch a lazy proxy after the rotation transaction has closed.
 *
 * @param sessionId the session's public unique id; it never changes on rotation
 */
public record RefreshTokenResult(
        CustomUserDetails userDetails,
        String newRawRefreshToken,
        UUID sessionId
) {
}
