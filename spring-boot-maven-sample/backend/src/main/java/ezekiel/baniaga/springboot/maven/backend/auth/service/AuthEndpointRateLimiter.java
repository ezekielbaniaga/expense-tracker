package ezekiel.baniaga.springboot.maven.backend.auth.service;

import ezekiel.baniaga.springboot.maven.backend.ratelimit.ClientIpKey;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.KeyedRateLimiter;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.RateLimitProperties;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.RateLimiterFactory;
import ezekiel.baniaga.springboot.maven.backend.ratelimit.TooManyRequestsException;
import org.springframework.stereotype.Service;

/**
 * Per client IP limits on POST /auth/register, /auth/refresh and /auth/logout, one bucket
 * per endpoint (an IPv6 client by its /64, see {@link ClientIpKey}). Every request counts,
 * failed or not: register is strict (mass account creation), refresh and logout are loose
 * (a normal client refreshes every 15 minutes per tab, and many users can share one IP
 * behind NAT). Login has its own limits, see {@link LoginRateLimiter}.
 */
@Service
public class AuthEndpointRateLimiter {

    private final KeyedRateLimiter register;
    private final KeyedRateLimiter refresh;
    private final KeyedRateLimiter logout;

    public AuthEndpointRateLimiter(RateLimiterFactory factory, RateLimitProperties properties) {
        this.register = factory.create(properties.getRegister().getClientIp());
        this.refresh = factory.create(properties.getRefresh().getClientIp());
        this.logout = factory.create(properties.getLogout().getClientIp());
    }

    /** @throws TooManyRequestsException if this IP registered too often */
    public void register(String clientIp) {
        register.consume(ClientIpKey.of(clientIp));
    }

    /** @throws TooManyRequestsException if this IP refreshed too often */
    public void refresh(String clientIp) {
        refresh.consume(ClientIpKey.of(clientIp));
    }

    /** @throws TooManyRequestsException if this IP logged out too often */
    public void logout(String clientIp) {
        logout.consume(ClientIpKey.of(clientIp));
    }
}
