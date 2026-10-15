package ezekiel.baniaga.springboot.maven.backend.auth.security;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

import ezekiel.baniaga.springboot.maven.backend.auth.props.JWTProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;

@Service
@RequiredArgsConstructor
public class JWTService {

    private final JWTProperties jwtProperties;

    // Built on first use, not at startup: the test profile runs without a JWT secret
    private volatile SecretKey signingKey;

    public String generateToken(CustomUserDetails user) {
        return generateToken(user, null);
    }

    /**
     * @param sessionId the session's public unique id, written as the {@code sid} claim;
     *                  when null the claim is left out
     */
    public String generateToken(CustomUserDetails user, UUID sessionId) {
        Instant now = Instant.now();

        JwtBuilder builder = Jwts.builder()
            .subject(user.getUsername())
            .claim("uid", user.getUniqueId().toString())
            .claim("role", user.getRole());
        if (sessionId != null) {
            builder.claim("sid", sessionId.toString());
        }
        return builder
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(jwtProperties.getExpiration())))
            .signWith(signingKey())
            .compact();
    }

    /**
     * Verifies signature and expiration once and returns the principal,
     * or empty when the token is invalid, tampered with, or expired.
     */
    public Optional<JWTPrincipal> parsePrincipal(String token) {
        try {
            return Optional.of(toPrincipal(extractAllClaims(token)));
        } catch (JwtException | IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    public JWTPrincipal extractPrincipal(String token) {
        return toPrincipal(extractAllClaims(token));
    }

    public String extractUsername(String token) {
        return extractAllClaims(token).getSubject();
    }

    public boolean isTokenValid(String token) {
        return parsePrincipal(token).isPresent();
    }

    public boolean isTokenExpired(String token) {
        return extractExpiration(token).isBefore(Instant.now());
    }

    public Instant extractExpiration(String token) {
        return extractAllClaims(token).getExpiration().toInstant();
    }

    // A missing sid is allowed (tokens issued before the claim existed); a malformed one
    // throws IllegalArgumentException, which parsePrincipal turns into empty
    private JWTPrincipal toPrincipal(Claims claims) {
        String sid = claims.get("sid", String.class);
        return new JWTPrincipal(
            UUID.fromString(claims.get("uid", String.class)),
            claims.getSubject(),
            claims.get("role", String.class),
            sid == null ? null : UUID.fromString(sid)
        );
    }

    // parseSignedClaims also rejects expired tokens (ExpiredJwtException)
    private Claims extractAllClaims(String token) {
        return Jwts.parser()
            .verifyWith(signingKey())
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    private SecretKey signingKey() {
        SecretKey key = signingKey;
        if (key == null) {
            key = Keys.hmacShaKeyFor(
                jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8)
            );
            signingKey = key;
        }
        return key;
    }
}
