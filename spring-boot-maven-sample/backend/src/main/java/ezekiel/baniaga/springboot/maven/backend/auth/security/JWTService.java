package ezekiel.baniaga.springboot.maven.backend.auth.security;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

import ezekiel.baniaga.springboot.maven.backend.auth.props.JWTProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.UnsupportedJwtException;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;

@Service
@RequiredArgsConstructor
public class JWTService {

    /**
     * Written as {@code iss} and required when parsing, so a token from another service that
     * happens to share the secret is rejected. Tokens issued before the claim existed have no
     * {@code iss} and are rejected too; clients get a 401 and refresh once (no access token needed).
     */
    public static final String ISSUER = "expense-tracker";

    // Pinned: signWith(key) alone lets jjwt pick HS384/HS512 for a 48+/64+ byte secret
    private static final String ALGORITHM = Jwts.SIG.HS256.getId();

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
            .issuer(ISSUER)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(jwtProperties.getExpiration())))
            .signWith(signingKey(), Jwts.SIG.HS256)
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
    // throws IllegalArgumentException, which parsePrincipal turns into empty.
    // uid, role and subject are required: a token signed with our key but missing one
    // (an older or hand-made token) is invalid, not a NullPointerException and a 500
    private JWTPrincipal toPrincipal(Claims claims) {
        String sid = claims.get("sid", String.class);
        return new JWTPrincipal(
            UUID.fromString(requireClaim(claims.get("uid", String.class), "uid")),
            requireClaim(claims.getSubject(), "sub"),
            requireClaim(claims.get("role", String.class), "role"),
            sid == null ? null : UUID.fromString(sid)
        );
    }

    private static String requireClaim(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Token is missing the " + name + " claim");
        }
        return value;
    }

    // parseSignedClaims also rejects expired tokens (ExpiredJwtException) and requireIssuer
    // a missing or different iss (IncorrectClaimException / MissingClaimException).
    // verifyWith accepts any HMAC algorithm the key is long enough for, so a 64-byte secret
    // would also verify an HS512 token; the header alg is checked explicitly.
    private Claims extractAllClaims(String token) {
        Jws<Claims> jws = Jwts.parser()
            .verifyWith(signingKey())
            .requireIssuer(ISSUER)
            .build()
            .parseSignedClaims(token);
        if (!ALGORITHM.equals(jws.getHeader().getAlgorithm())) {
            throw new UnsupportedJwtException("Token is not signed with " + ALGORITHM);
        }
        return jws.getPayload();
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
