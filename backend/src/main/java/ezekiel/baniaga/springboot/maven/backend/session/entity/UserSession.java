package ezekiel.baniaga.springboot.maven.backend.session.entity;

import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * These are important meaning of date fields:
 *
        | Field        | Meaning                                           |
        | ------------ | ------------------------------------------------- |
        | `createdAt`  | When this login/session was created               |
        | `lastUsedAt` | Last time the refresh token was successfully used |
        | `expiresAt`  | Absolute expiration of the session                |
        | `revokedAt`  | Whether the session was explicitly revoked        |
*/

@Entity
@Table(name = "user_sessions")
@Getter @Setter @NoArgsConstructor
public class UserSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Public id exposed by the session endpoints and the access token's sid claim
    @Column(name = "unique_id", nullable = false, updatable = false, unique = true)
    private UUID uniqueId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "refresh_token_hash", nullable = false, unique = true, length = 64)
    private String refreshTokenHash;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;


}
