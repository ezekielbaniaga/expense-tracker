package ezekiel.baniaga.springboot.maven.backend.session.props;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.session")
@Validated
@Getter @Setter
public class SessionProperties {

    /**
     * How long a session (its refresh token) lasts from login. Refreshing
     * does not extend it. Spring Boot can bind "30d", "12h", etc.
     * At least 1 second, checked at startup: zero or less would make every
     * login create an already expired session.
     */
    @NotNull
    @DurationMin(seconds = 1, message = "must be at least 1 second")
    private Duration lifetime = Duration.ofDays(30);

    /**
     * Most active sessions a user can have; logging in past it ends the
     * least recently used ones. At least 1, checked at startup.
     */
    @Min(1)
    private int maxActive = 10;

    /**
     * How long expired or revoked sessions are kept (e.g. to look into a
     * reuse incident) before the nightly cleanup deletes them.
     * Zero or more, checked at startup: a negative value would put the
     * cleanup cutoff in the future and delete active sessions.
     */
    @NotNull
    @DurationMin(seconds = 0, message = "must be zero or positive")
    private Duration retention = Duration.ofDays(7);

}
