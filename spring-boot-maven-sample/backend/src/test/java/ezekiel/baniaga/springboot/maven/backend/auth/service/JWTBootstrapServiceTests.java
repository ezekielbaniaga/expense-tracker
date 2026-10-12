package ezekiel.baniaga.springboot.maven.backend.auth.service;

import ezekiel.baniaga.springboot.maven.backend.auth.props.JWTProperties;
import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Plain unit test: no Spring context needed
class JWTBootstrapServiceTests {

    @Test
    void blankSecretIsRejected() {
        assertThatThrownBy(() -> check(""))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("required");
    }

    @Test
    void secretShorterThan32BytesIsRejectedAtStartup() {
        assertThatThrownBy(() -> check("a".repeat(31)))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("at least 32 bytes (got 31)");
    }

    @Test
    void secretThatPassesTheCheckCanSignTokens() {
        String secret = "a".repeat(32);

        assertThatCode(() -> check(secret)).doesNotThrowAnyException();

        // Same key derivation as login, so passing startup means login works
        assertThat(new JWTService(properties(secret)).generateToken(
            new CustomUserDetails(1L, UUID.randomUUID(), "alice", "pw", "USER", true))).isNotBlank();
    }

    private static void check(String secret) {
        new JWTBootstrapService(properties(secret)).checkEnvironmentVariable();
    }

    private static JWTProperties properties(String secret) {
        JWTProperties properties = new JWTProperties();
        properties.setSecret(secret);
        return properties;
    }
}
