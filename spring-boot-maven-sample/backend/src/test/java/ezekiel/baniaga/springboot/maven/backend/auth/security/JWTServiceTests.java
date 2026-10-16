package ezekiel.baniaga.springboot.maven.backend.auth.security;

import ezekiel.baniaga.springboot.maven.backend.auth.props.JWTProperties;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Plain unit test: no Spring context or database needed
class JWTServiceTests {

    private static final String SECRET = "test-secret-that-is-at-least-32-bytes-long";

    // 64 bytes: long enough that jjwt would pick HS512 if the algorithm were not pinned
    private static final String LONG_SECRET =
        "test-secret-that-is-at-least-64-bytes-long-so-jjwt-could-pick-512";

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
            .issuer(JWTService.ISSUER)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(Duration.ofMinutes(15))))
            .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
            .compact();

        assertThat(service(SECRET, Duration.ofMinutes(15)).parsePrincipal(token)).isEmpty();
    }

    // Signed with our key but missing a required claim (an older or hand-made token):
    // rejected, not a NullPointerException that the filter would turn into a 500
    @Test
    void tokenWithoutUidIsRejected() {
        String token = signedToken("alice", null, "USER");

        assertThat(service(SECRET, Duration.ofMinutes(15)).parsePrincipal(token)).isEmpty();
    }

    @Test
    void tokenWithoutRoleIsRejected() {
        String token = signedToken("alice", user.getUniqueId().toString(), null);

        assertThat(service(SECRET, Duration.ofMinutes(15)).parsePrincipal(token)).isEmpty();
    }

    @Test
    void tokenWithoutSubjectIsRejected() {
        String token = signedToken(null, user.getUniqueId().toString(), "USER");

        assertThat(service(SECRET, Duration.ofMinutes(15)).parsePrincipal(token)).isEmpty();
    }

    @Test
    void tokenWithBlankClaimsIsRejected() {
        JWTService service = service(SECRET, Duration.ofMinutes(15));

        assertThat(service.parsePrincipal(signedToken("alice", " ", "USER"))).isEmpty();
        assertThat(service.parsePrincipal(signedToken("alice", user.getUniqueId().toString(), " "))).isEmpty();
        assertThat(service.parsePrincipal(signedToken(" ", user.getUniqueId().toString(), "USER"))).isEmpty();
    }

    // jjwt picks the algorithm by key length (64+ bytes would give HS512); it is pinned to HS256
    @Test
    void longSecretStillSignsWithHs256() {
        JWTService service = service(LONG_SECRET, Duration.ofMinutes(15));
        String token = service.generateToken(user);

        assertThat(header(token)).contains("\"alg\":\"HS256\"");
        assertThat(service.parsePrincipal(token)).isPresent();
    }

    // Same key, correct claims and issuer, valid HS512 signature: still rejected
    @Test
    void tokenSignedWithHs512IsRejected() {
        Instant now = Instant.now();
        String token = Jwts.builder()
            .subject("alice")
            .claim("uid", user.getUniqueId().toString())
            .claim("role", "USER")
            .issuer(JWTService.ISSUER)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(Duration.ofMinutes(15))))
            .signWith(Keys.hmacShaKeyFor(LONG_SECRET.getBytes(StandardCharsets.UTF_8)), Jwts.SIG.HS512)
            .compact();
        assertThat(header(token)).contains("\"alg\":\"HS512\"");

        assertThat(service(LONG_SECRET, Duration.ofMinutes(15)).parsePrincipal(token)).isEmpty();
    }

    @Test
    void generatedTokenCarriesTheIssuer() {
        JWTService service = service(SECRET, Duration.ofMinutes(15));
        String token = service.generateToken(user);

        String issuer = Jwts.parser()
            .verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
            .build()
            .parseSignedClaims(token)
            .getPayload()
            .getIssuer();
        assertThat(issuer).isEqualTo(JWTService.ISSUER);
    }

    // A token from another service sharing the secret, or one issued before iss existed
    @Test
    void tokenWithoutIssuerIsRejected() {
        String token = signedToken("alice", user.getUniqueId().toString(), "USER", null);

        assertThat(service(SECRET, Duration.ofMinutes(15)).parsePrincipal(token)).isEmpty();
    }

    @Test
    void tokenWithAnotherIssuerIsRejected() {
        String token = signedToken("alice", user.getUniqueId().toString(), "USER", "another-service");

        assertThat(service(SECRET, Duration.ofMinutes(15)).parsePrincipal(token)).isEmpty();
    }

    private static String header(String token) {
        return new String(Base64.getUrlDecoder().decode(token.substring(0, token.indexOf('.'))),
            StandardCharsets.UTF_8);
    }

    private static String signedToken(String subject, String uid, String role) {
        return signedToken(subject, uid, role, JWTService.ISSUER);
    }

    // Builds a token signed with SECRET (HS256 for its 42 bytes); a null argument leaves that claim out
    private static String signedToken(String subject, String uid, String role, String issuer) {
        Instant now = Instant.now();
        JwtBuilder builder = Jwts.builder();
        if (subject != null) {
            builder.subject(subject);
        }
        if (uid != null) {
            builder.claim("uid", uid);
        }
        if (role != null) {
            builder.claim("role", role);
        }
        if (issuer != null) {
            builder.issuer(issuer);
        }
        return builder
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(Duration.ofMinutes(15))))
            .signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
            .compact();
    }

    private static JWTService service(String secret, Duration expiration) {
        JWTProperties properties = new JWTProperties();
        properties.setSecret(secret);
        properties.setExpiration(expiration);
        return new JWTService(properties);
    }
}
