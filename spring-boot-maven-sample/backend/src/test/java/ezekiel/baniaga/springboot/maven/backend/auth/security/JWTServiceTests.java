package ezekiel.baniaga.springboot.maven.backend.auth.security;

import ezekiel.baniaga.springboot.maven.backend.auth.props.JWTProperties;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Plain unit test: no Spring context or database needed
class JWTServiceTests {

    private static final String SECRET = "test-secret-that-is-at-least-32-bytes-long";

    private final CustomUserDetails user =
        new CustomUserDetails(1L, UUID.randomUUID(), "alice", "pw", "USER", true);

    @Test
    void validTokenParsesToPrincipal() {
        JWTService service = service(SECRET, Duration.ofMinutes(15));

        JWTPrincipal principal = service.parsePrincipal(service.generateToken(user)).orElseThrow();

        assertThat(principal.userId()).isEqualTo(user.getUniqueId());
        assertThat(principal.username()).isEqualTo("alice");
        assertThat(principal.role()).isEqualTo("USER");
    }

    @Test
    void expiredTokenIsRejected() {
        JWTService service = service(SECRET, Duration.ofMinutes(-1));

        assertThat(service.parsePrincipal(service.generateToken(user))).isEmpty();
    }

    @Test
    void tokenSignedWithAnotherKeyIsRejected() {
        String foreign = service("another-secret-that-is-also-32-bytes-long", Duration.ofMinutes(15))
            .generateToken(user);

        assertThat(service(SECRET, Duration.ofMinutes(15)).parsePrincipal(foreign)).isEmpty();
    }

    @Test
    void tamperedOrGarbageTokenIsRejected() {
        JWTService service = service(SECRET, Duration.ofMinutes(15));
        String token = service.generateToken(user);
        String tampered = token.substring(0, token.length() - 2) + (token.endsWith("AA") ? "BB" : "AA");

        assertThat(service.parsePrincipal(tampered)).isEmpty();
        assertThat(service.parsePrincipal("not-a-jwt")).isEmpty();
        assertThat(service.parsePrincipal("")).isEmpty();
    }

    private static JWTService service(String secret, Duration expiration) {
        JWTProperties properties = new JWTProperties();
        properties.setSecret(secret);
        properties.setExpiration(expiration);
        return new JWTService(properties);
    }
}
