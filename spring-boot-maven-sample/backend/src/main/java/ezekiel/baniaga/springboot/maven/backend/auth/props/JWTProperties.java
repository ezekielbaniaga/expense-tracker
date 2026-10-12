package ezekiel.baniaga.springboot.maven.backend.auth.props;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.jwt")
@Getter @Setter
public class JWTProperties {

    /**
     * At least 256 bits (32 bytes) for HS256; checked at startup.
     * Generate it locally (never on a website): openssl rand -base64 32
     */
    private String secret;

    /**
     * Spring Boot can bind "15m", "1h", etc.
     */
    private Duration expiration = Duration.ofMinutes(15);

}
