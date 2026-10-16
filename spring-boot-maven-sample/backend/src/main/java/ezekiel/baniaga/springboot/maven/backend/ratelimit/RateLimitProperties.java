package ezekiel.baniaga.springboot.maven.backend.ratelimit;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Limits for the in-memory rate limiter. The buckets live in this instance's memory,
 * so with several instances each one counts on its own.
 */
@ConfigurationProperties(prefix = "app.rate-limit")
@Getter @Setter
public class RateLimitProperties {

    /**
     * Most keys (usernames, IPs) one limiter remembers. Beyond this the least recently used
     * are dropped, so random usernames can't grow memory forever.
     */
    private long maxKeys = 100_000;

    private Login login = new Login();

    @Getter @Setter
    public static class Login {

        /** Failed logins per normalized username, from any IP, so one account can't be guessed. */
        private Limit usernameFailures = new Limit(5, Duration.ofMinutes(15));

        /** Login attempts per client IP, so many accounts can't be sprayed from one address. */
        private Limit clientIp = new Limit(20, Duration.ofMinutes(1));
    }

    /** {@code capacity} requests per {@code period}, refilled gradually over the period. */
    @Getter @Setter
    @NoArgsConstructor @AllArgsConstructor
    public static class Limit {
        private long capacity;
        private Duration period;
    }
}
