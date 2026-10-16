package ezekiel.baniaga.springboot.maven.backend.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.TimeMeter;

import java.util.concurrent.TimeUnit;

/**
 * One token bucket per key (a username, a client IP), held in memory.
 * <p>
 * The map is bounded: a bucket untouched for a whole period is full again anyway, so it
 * expires then, and at most {@code maxKeys} buckets are kept. Create one with
 * {@link RateLimiterFactory}.
 */
public class KeyedRateLimiter {

    // Keys come from the client (a username has no length limit at login); cap what we store
    static final int MAX_KEY_LENGTH = 128;

    private final Bandwidth bandwidth;
    private final TimeMeter timeMeter;
    private final Cache<String, Bucket> buckets;

    KeyedRateLimiter(RateLimitProperties.Limit limit, long maxKeys, TimeMeter timeMeter) {
        // Greedy: tokens come back gradually, e.g. 5 per 15 minutes is one every 3 minutes
        this.bandwidth = Bandwidth.builder()
            .capacity(limit.getCapacity())
            .refillGreedy(limit.getCapacity(), limit.getPeriod())
            .build();
        this.timeMeter = timeMeter;
        this.buckets = Caffeine.newBuilder()
            .expireAfterAccess(limit.getPeriod())
            .maximumSize(maxKeys)
            .ticker(timeMeter::currentTimeNanos)
            .build();
    }

    /**
     * Takes one token for the key, or throws {@link TooManyRequestsException} if none is left.
     */
    public void consume(String key) {
        ConsumptionProbe probe = bucket(key).tryConsumeAndReturnRemaining(1);
        if (!probe.isConsumed()) {
            long seconds = TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill() + 999_999_999L);
            throw new TooManyRequestsException(Math.max(1, seconds));
        }
    }

    /**
     * Gives back a token taken by {@link #consume}, e.g. when only failures should count.
     * Never above the capacity.
     */
    public void refund(String key) {
        Bucket bucket = buckets.getIfPresent(cap(key));
        if (bucket != null) {
            bucket.addTokens(1);
        }
    }

    private Bucket bucket(String key) {
        return buckets.get(cap(key), k -> Bucket.builder()
            .addLimit(bandwidth)
            .withCustomTimePrecision(timeMeter)
            .build());
    }

    private static String cap(String key) {
        String k = key == null ? "" : key;
        return k.length() > MAX_KEY_LENGTH ? k.substring(0, MAX_KEY_LENGTH) : k;
    }
}
