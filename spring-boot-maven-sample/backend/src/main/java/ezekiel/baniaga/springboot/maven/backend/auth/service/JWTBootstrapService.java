package ezekiel.baniaga.springboot.maven.backend.auth.service;

import ezekiel.baniaga.springboot.maven.backend.auth.props.JWTProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

@Service
@RequiredArgsConstructor
public class JWTBootstrapService {

    private final JWTProperties properties;

    // HS256 needs a key of at least 256 bits; shorter ones fail on the first login instead
    private static final int MIN_SECRET_BYTES = 32;

    public void checkEnvironmentVariable() {

        if (properties.getSecret().isBlank()) {
            throw new IllegalStateException(
                "JWT_SECRET environment variable is required."
            );
        }

        int bytes = properties.getSecret().getBytes(StandardCharsets.UTF_8).length;
        if (bytes < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                "JWT_SECRET must be at least " + MIN_SECRET_BYTES + " bytes (got " + bytes
                    + "). Generate one with: openssl rand -base64 32"
            );
        }
    }
}
