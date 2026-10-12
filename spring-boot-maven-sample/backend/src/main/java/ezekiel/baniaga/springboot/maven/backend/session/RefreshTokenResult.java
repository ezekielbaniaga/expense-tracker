package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;

/**
 * Holds plain user details instead of the User entity, so callers never
 * touch a lazy proxy after the rotation transaction has closed.
 */
public record RefreshTokenResult(
        CustomUserDetails userDetails,
        String newRawRefreshToken
) {
}
