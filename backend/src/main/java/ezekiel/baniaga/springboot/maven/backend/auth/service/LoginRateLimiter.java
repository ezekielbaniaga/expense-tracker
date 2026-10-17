package ezekiel.baniaga.springboot.maven.backend.auth.service;

import ezekiel.baniaga.springboot.maven.backend.ratelimit.ClientIpKey;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.KeyedRateLimiter;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.RateLimitProperties;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.RateLimiterFactory;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.TooManyRequestsException;
import org.springframework.stereotype.Service;

import java.util.Locale;

/**
 * Three limits on POST /auth/login:
 * <ul>
 *   <li>per client IP (an IPv6 client by its /64, see {@link ClientIpKey}), every attempt
 *       counts (password spraying across many accounts)</li>
 *   <li>per normalized username and client IP, only failures count and the limit is strict
 *       (guessing one account from one place). Keyed by IP too, so an attacker's wrong guesses
 *       lock only their own address out of the account, not its owner</li>
 *   <li>per normalized username from any IP, only failures count and the limit is loose
 *       (guessing one account from many IPs). It is a backstop: draining it locks the account
 *       for everyone, so it takes far more guesses than the strict bucket</li>
 * </ul>
 * A user who logs in fine is never locked out by their own logins. Unknown usernames get
 * buckets too, so a 429 doesn't reveal which accounts exist.
 */
@Service
public class LoginRateLimiter {

    private final KeyedRateLimiter byClientIp;
    private final KeyedRateLimiter byUsernameAndClientIpFailures;
    private final KeyedRateLimiter byUsernameFailures;

    public LoginRateLimiter(RateLimiterFactory factory, RateLimitProperties properties) {
        this.byClientIp = factory.create(properties.getLogin().getClientIp());
        this.byUsernameAndClientIpFailures = factory.create(properties.getLogin().getUsernameClientIpFailures());
        this.byUsernameFailures = factory.create(properties.getLogin().getUsernameFailures());
    }

    /**
     * Call before checking the password. Takes a token from all three buckets; the two
     * username ones come back in {@link #succeeded}. Taking it up front (rather than after a failure)
     * keeps concurrent wrong guesses from slipping past the limit.
     *
     * @throws TooManyRequestsException if any limit is reached
     */
    public void beforeAttempt(String username, String clientIp) {
        String ipKey = ClientIpKey.of(clientIp);
        byClientIp.consume(ipKey);
        byUsernameAndClientIpFailures.consume(usernameAndIp(username, ipKey));
        byUsernameFailures.consume(normalize(username));
    }

    /** The password was right: this attempt was not a failure. */
    public void succeeded(String username, String clientIp) {
        byUsernameAndClientIpFailures.refund(usernameAndIp(username, ClientIpKey.of(clientIp)));
        byUsernameFailures.refund(normalize(username));
    }

    // IP first: a key over the limiter's length cap loses the end of a long username, not the IP
    private static String usernameAndIp(String username, String ipKey) {
        return ipKey + "|" + normalize(username);
    }

    // Login strips the name and matches it in any case (see DatabaseUserDetailsService),
    // so " Alice" and "alice" are the same account and share a bucket
    private static String normalize(String username) {
        return username.strip().toLowerCase(Locale.ROOT);
    }
}
