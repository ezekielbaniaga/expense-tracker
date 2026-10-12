package ezekiel.baniaga.springboot.maven.backend.session.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * A refresh token hash that was already rotated out of its session.
 * Presenting it again is treated as token theft.
 */
@Entity
@Table(name = "used_refresh_tokens")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class UsedRefreshToken {

    @Id
    @Column(name = "token_hash", length = 64)
    private String tokenHash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private UserSession session;

    @Column(name = "used_at", nullable = false)
    private LocalDateTime usedAt;
}
