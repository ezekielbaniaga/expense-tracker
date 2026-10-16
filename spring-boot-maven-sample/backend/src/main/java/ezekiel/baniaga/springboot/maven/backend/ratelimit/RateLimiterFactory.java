package ezekiel.baniaga.springboot.maven.backend.ratelimit;

import io.github.bucket4j.TimeMeter;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * Builds {@link KeyedRateLimiter}s that share the key bound and the clock. A service that
 * limits an endpoint creates its own limiter here, e.g. one per client IP.
 * <p>
 * The clock is the system clock unless a {@link TimeMeter} bean exists (tests use one to skip
 * a window instead of waiting it out).
 */
@Component
public class RateLimiterFactory {

    private final RateLimitProperties properties;
    private final TimeMeter timeMeter;

    public RateLimiterFactory(RateLimitProperties properties, ObjectProvider<TimeMeter> timeMeter) {
        this.properties = properties;
        this.timeMeter = timeMeter.getIfAvailable(() -> TimeMeter.SYSTEM_MILLISECONDS);
    }

    public KeyedRateLimiter create(RateLimitProperties.Limit limit) {
        return new KeyedRateLimiter(limit, properties.getMaxKeys(), timeMeter);
    }
}
