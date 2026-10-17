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

    /** Registrations per client IP: strict, an account is rarely created twice from one place. */
    private PerClientIp register = new PerClientIp(new Limit(10, Duration.ofHours(1)));

    /** Refreshes per client IP: loose, each open tab refreshes every 15 minutes and many users may share an IP. */
    private PerClientIp refresh = new PerClientIp(new Limit(60, Duration.ofMinutes(1)));

    /** Logouts per client IP: loose like refresh. */
    private PerClientIp logout = new PerClientIp(new Limit(60, Duration.ofMinutes(1)));

    private PasswordChange passwordChange = new PasswordChange();

    @Getter @Setter
    public static class Login {

        /**
         * Failed logins per normalized username and client IP: strict, so one account can't be
         * guessed from one place, and the guesser locks out only their own address.
         */
        private Limit usernameClientIpFailures = new Limit(5, Duration.ofMinutes(15));

        /**
         * Failed logins per normalized username from any IP: loose backstop against guessing one
         * account from many IPs. Draining it locks the account for everyone.
         */
        private Limit usernameFailures = new Limit(100, Duration.ofHours(1));

        /** Login attempts per client IP, so many accounts can't be sprayed from one address. */
        private Limit clientIp = new Limit(20, Duration.ofMinutes(1));
    }

    @Getter @Setter
    public static class PasswordChange {

        /** Wrong current passwords per user (by unique_id); right ones don't count. */
        private Limit failures = new Limit(5, Duration.ofMinutes(15));
    }

    /** An endpoint limited only per client IP, where every request counts. */
    @Getter @Setter
    @NoArgsConstructor @AllArgsConstructor
    public static class PerClientIp {
        private Limit clientIp;
    }

    /** {@code capacity} requests per {@code period}, refilled gradually over the period. */
    @Getter @Setter
    @NoArgsConstructor @AllArgsConstructor
    public static class Limit {
        private long capacity;
        private Duration period;
    }
}
