package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.ratelimit.KeyedRateLimiter;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.RateLimitProperties;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.RateLimiterFactory;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.TooManyRequestsException;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Limits wrong current passwords on POST /users/me/password, so someone holding a user's
 * access token can't guess the password and take the account over. Keyed by the user's
 * unique_id from the token: only a caller authenticated as that user can use up the bucket,
 * so nobody can lock another user out of changing their password.
 * <p>
 * Only failures count, like the per-username login limit (see LoginRateLimiter).
 */
@Service
public class PasswordChangeRateLimiter {

    private final KeyedRateLimiter byUserFailures;

    public PasswordChangeRateLimiter(RateLimiterFactory factory, RateLimitProperties properties) {
        this.byUserFailures = factory.create(properties.getPasswordChange().getFailures());
    }

    /**
     * Call before checking the current password. The token comes back in {@link #succeeded};
     * taking it up front keeps concurrent wrong guesses from slipping past the limit.
     *
     * @throws TooManyRequestsException if the user has too many recent failures
     */
    public void beforeAttempt(UUID userId) {
        byUserFailures.consume(userId.toString());
    }

    /** The current password was right: this attempt was not a failure. */
    public void succeeded(UUID userId) {
        byUserFailures.refund(userId.toString());
    }
}
