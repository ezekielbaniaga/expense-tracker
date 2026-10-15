package ezekiel.baniaga.springboot.maven.backend.auth.security;

import ezekiel.baniaga.springboot.maven.backend.auth.props.JWTProperties;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
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

    @Test
    void sessionIdRoundTripsThroughTheSidClaim() {
        JWTService service = service(SECRET, Duration.ofMinutes(15));
        UUID sessionId = UUID.randomUUID();

        JWTPrincipal principal = service.parsePrincipal(service.generateToken(user, sessionId)).orElseThrow();

        assertThat(principal.sessionId()).isEqualTo(sessionId);
        assertThat(principal.userId()).isEqualTo(user.getUniqueId());
    }

    // Tokens issued before sid existed must keep working until they expire
    @Test
    void tokenWithoutSidParsesWithNullSessionId() {
        JWTService service = service(SECRET, Duration.ofMinutes(15));

        JWTPrincipal principal = service.parsePrincipal(service.generateToken(user)).orElseThrow();

        assertThat(principal.sessionId()).isNull();
    }

    @Test
    void tokenWithNonUuidSidIsRejected() {
        Instant now = Instant.now();
        String token = Jwts.builder()
            .subject("alice")
            .claim("uid", user.getUniqueId().toString())
            .claim("role", "USER")
            .claim("sid", "not-a-uuid")
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(Duration.ofMinutes(15))))
            .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
            .compact();

        assertThat(service(SECRET, Duration.ofMinutes(15)).parsePrincipal(token)).isEmpty();
    }

    private static JWTService service(String secret, Duration expiration) {
        JWTProperties properties = new JWTProperties();
        properties.setSecret(secret);
        properties.setExpiration(expiration);
        return new JWTService(properties);
    }
}
