package ezekiel.baniaga.springboot.maven.backend.auth.props;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.jwt")
@Validated
@Getter @Setter
public class JWTProperties {

    /**
     * At least 256 bits (32 bytes) for HS256; checked at startup.
     * Tokens are always HS256: a longer secret does not change the algorithm.
     * Generate it locally (never on a website): openssl rand -base64 32
     */
    private String secret;

    /**
     * Spring Boot can bind "15m", "1h", etc. At least 1 second, checked at
     * startup: zero or less would issue already expired access tokens.
     */
    @NotNull
    @DurationMin(seconds = 1, message = "must be at least 1 second")
    private Duration expiration = Duration.ofMinutes(15);

}
