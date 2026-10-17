package ezekiel.baniaga.springboot.maven.backend.session;

import org.springframework.security.authentication.BadCredentialsException;

/**
 * An already-rotated refresh token was presented again.
 * Extends BadCredentialsException so the client still just gets 401.
 */
public class RefreshTokenReuseException extends BadCredentialsException {

    public RefreshTokenReuseException(String message) {
        super(message);
    }
}
