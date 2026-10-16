package ezekiel.baniaga.springboot.maven.backend.ratelimit;

import lombok.Getter;

/**
 * A rate limit was hit. Answered as 429 TOO_MANY_REQUESTS with a Retry-After header.
 */
@Getter
public class TooManyRequestsException extends RuntimeException {

    /** Whole seconds until the next request is allowed, at least 1. */
    private final long retryAfterSeconds;

    public TooManyRequestsException(long retryAfterSeconds) {
        super("Too many requests, try again later");
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
