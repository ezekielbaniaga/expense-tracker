package ezekiel.baniaga.springboot.maven.backend.session.props;

import jakarta.validation.constraints.Min;
import lombok.Getter;
import lombok.Setter;
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
     */
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
     */
    private Duration retention = Duration.ofDays(7);

}
