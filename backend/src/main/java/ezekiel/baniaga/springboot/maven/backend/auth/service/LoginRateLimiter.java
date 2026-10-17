package ezekiel.baniaga.springboot.maven.backend.auth.service;

import ezekiel.baniaga.springboot.maven.backend.ratelimit.ClientIpKey;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.KeyedRateLimiter;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.RateLimitProperties;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.RateLimiterFactory;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.TooManyRequestsException;
import org.springframework.stereotype.Service;

import java.util.Locale;

/**
 * Two limits on POST /auth/login:
 * <ul>
 *   <li>per client IP (an IPv6 client by its /64, see {@link ClientIpKey}), every attempt
 *       counts (password spraying across many accounts)</li>
 *   <li>per normalized username, only failures count (guessing one account from many IPs),
 *       so a user who logs in fine is never locked out by their own logins</li>
 * </ul>
 * Unknown usernames get buckets too, so a 429 doesn't reveal which accounts exist.
 */
@Service
public class LoginRateLimiter {

    private final KeyedRateLimiter byClientIp;
    private final KeyedRateLimiter byUsernameFailures;

    public LoginRateLimiter(RateLimiterFactory factory, RateLimitProperties properties) {
        this.byClientIp = factory.create(properties.getLogin().getClientIp());
        this.byUsernameFailures = factory.create(properties.getLogin().getUsernameFailures());
    }

    /**
     * Call before checking the password. Takes a token from both buckets; the username's
     * comes back in {@link #succeeded}. Taking it up front (rather than after a failure)
     * keeps concurrent wrong guesses from slipping past the limit.
     *
     * @throws TooManyRequestsException if either limit is reached
     */
    public void beforeAttempt(String username, String clientIp) {
        byClientIp.consume(ClientIpKey.of(clientIp));
        byUsernameFailures.consume(normalize(username));
    }

    /** The password was right: this attempt was not a failure. */
    public void succeeded(String username) {
        byUsernameFailures.refund(normalize(username));
    }

    // Login strips the name and matches it in any case (see DatabaseUserDetailsService),
    // so " Alice" and "alice" are the same account and share a bucket
    private static String normalize(String username) {
        return username.strip().toLowerCase(Locale.ROOT);
    }
}
