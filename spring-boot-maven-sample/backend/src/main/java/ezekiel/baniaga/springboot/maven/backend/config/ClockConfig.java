package ezekiel.baniaga.springboot.maven.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * The app's one source of "now". UTC, so session expiry, cleanup cutoffs and
 * stored timestamps don't depend on the host or container time zone or its
 * DST changes, and instances in different zones agree. Tests replace it with
 * a fixed or movable clock.
 */
@Configuration(proxyBeanMethods = false)
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
