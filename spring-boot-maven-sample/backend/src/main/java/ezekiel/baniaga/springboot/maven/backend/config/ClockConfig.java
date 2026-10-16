package ezekiel.baniaga.springboot.maven.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import org.springframework.boot.validation.autoconfigure.ValidationConfigurationCustomizer;

import java.time.Clock;
import java.time.ZoneOffset;

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

    /**
     * Bean validation's "now" (@PastOrPresent on the expense date) is the app Clock, not the JVM
     * zone captured at startup. Offset to UTC+14, the earliest zone on Earth, so "present" is
     * today anywhere: a user ahead of UTC can record an expense dated today.
     */
    @Bean
    public ValidationConfigurationCustomizer validationClockCustomizer(Clock clock) {
        return configuration -> configuration.clockProvider(() -> clock.withZone(ZoneOffset.ofHours(14)));
    }
}
