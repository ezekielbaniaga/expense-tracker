package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.common.ResourceNotFoundException;
import ezekiel.baniaga.springboot.maven.backend.session.dto.SessionResponse;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UsedRefreshToken;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.session.mapper.SessionMapper;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserSessionService {

    // Matches user_sessions.user_agent VARCHAR(500) (V7)
    private static final int MAX_USER_AGENT_LENGTH = 500;

    private final UserRepository userRepository;
    private final UserSessionRepository repository;
    private final UsedRefreshTokenRepository usedRefreshTokenRepository;
    private final CustomUserDetailsMapper customUserDetailsMapper;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final RefreshTokenHasher refreshTokenHasher;
    private final SessionMapper sessionMapper;

    /**
     * Creates a new session and saves to db for
     * controlling session later like revocation
     *
     * Note: Raw refresh token is returned but
     * never saved to db for security. The session's
     * public id is returned too, for the sid claim.
     *
        rawRefreshToken
           │
           ├──▶ Client
           │
           └──▶ NEVER database
     */
    public CreatedSession createSession(
            Long userId,
            String userAgent,
            String ipAddress) {

        String rawRefreshToken = refreshTokenGenerator.generate();
        String hashedRefreshToken = refreshTokenHasher.hash(rawRefreshToken);
        LocalDateTime now = LocalDateTime.now();

        //This creates a reference/proxy without immediately querying the database.
        User user = userRepository.getReferenceById(userId);

        UserSession session = new UserSession();
        // Random v4: a session id must not reveal when the session was created
        session.setUniqueId(UUID.randomUUID());
        session.setUser(user);
        session.setRefreshTokenHash(hashedRefreshToken);
        session.setUserAgent(truncateUserAgent(userAgent));
        session.setIpAddress(ipAddress);
        session.setCreatedAt(now);
        session.setLastUsedAt(now);
        session.setExpiresAt(now.plusDays(30));

        repository.save(session);

        return new CreatedSession(rawRefreshToken, session.getUniqueId());
    }

    /**
     * Swaps the refresh token for a new one. The old hash is remembered
     * so presenting it again can be detected as token theft.
     *
        old token reused?
           │
           ├──▶ revoke the whole session (attacker AND real user are logged out)
           │
           └──▶ 401, real user must log in again
     *
     * Runs in one transaction with the session row locked, so two concurrent
     * refreshes with the same token can't both succeed: the second one waits,
     * then sees the token as already used. The reuse and disabled exceptions
     * must not roll back the session revoke, hence noRollbackFor.
     */
    @Transactional(noRollbackFor = {RefreshTokenReuseException.class, DisabledException.class})
    public RefreshTokenResult rotateRefreshToken(String rawRefreshToken) {

        String oldHash = refreshTokenHasher.hash(rawRefreshToken);

        UserSession userSession = repository.findForUpdateByRefreshTokenHash(oldHash)
            .orElseThrow(() -> handleUnknownToken(oldHash));

        if (userSession.getRevokedAt() != null) {
            throw new BadCredentialsException("Refresh token has been revoked");
        }

        if (userSession.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BadCredentialsException("Refresh token has expired");
        }

        // Access tokens can't be recalled, but a disabled user must not get new ones.
        // Revoke so re-enabling the account doesn't bring this session back.
        if (!userSession.getUser().isEnabled()) {
            repository.revoke(userSession.getId(), LocalDateTime.now());
            throw new DisabledException("User account is disabled");
        }

        String newRawRefreshToken = refreshTokenGenerator.generate();
        String newHash = refreshTokenHasher.hash(newRawRefreshToken);
        LocalDateTime now = LocalDateTime.now();

        usedRefreshTokenRepository.save(
            new UsedRefreshToken(oldHash, userSession, now));

        userSession.setRefreshTokenHash(newHash);
        userSession.setLastUsedAt(now);

        repository.save(userSession);

        // Map while the transaction is open; the User is a lazy proxy
        return new RefreshTokenResult(
            customUserDetailsMapper.toCustomUserDetails(userSession.getUser()),
            newRawRefreshToken,
            userSession.getUniqueId()
        );
    }

    /**
     * Logout: revokes the session the refresh token belongs to.
     * Unknown or already-rotated tokens are ignored, so the caller can't
     * tell valid tokens from invalid ones.
     */
    public void revokeSession(String rawRefreshToken) {
        String hash = refreshTokenHasher.hash(rawRefreshToken);

        repository.findByRefreshTokenHash(hash)
            .ifPresent(session -> repository.revoke(session.getId(), LocalDateTime.now()));
    }

    /**
     * Ends every active session of the user, e.g. after a password change.
     * Their refresh tokens stop working; access tokens already issued stay
     * valid until they expire.
     */
    @Transactional
    public int revokeAllForUser(Long userId) {
        return repository.revokeAllForUser(userId, LocalDateTime.now());
    }

    /**
     * Revokes one session of the user, by its public unique id. A session
     * that doesn't exist or belongs to someone else is 404 SESSION_NOT_FOUND,
     * so other users' session ids can't be probed. One that is already
     * revoked or expired is a no-op, so repeating the call is safe.
     *
     * Uses the bulk revoke query instead of setting revokedAt on the loaded
     * entity: saving the entity would race with a concurrent refresh that
     * holds the row lock and rotates the token.
     */
    @Transactional
    public void revokeOwnSession(UUID userUniqueId, UUID sessionId) {
        UserSession session = userRepository.findByUniqueId(userUniqueId)
            .flatMap(user -> repository.findByUniqueIdAndUserId(sessionId, user.getId()))
            .orElseThrow(() -> new ResourceNotFoundException("SESSION_NOT_FOUND", "Session not found."));

        repository.revoke(session.getId(), LocalDateTime.now());

        log.info("Revoked session {} of user {}", sessionId, userUniqueId);
    }

    /**
     * Active sessions of the user, most recently used first. The one whose
     * unique_id equals currentSid is marked current; with no sid (older
     * tokens) none is. No paging: active sessions are capped per user.
     *
     * Resolves the user by unique id because the JWT filter leaves the
     * database id null. Uses UserRepository, not UserService, which already
     * depends on this service.
     */
    @Transactional(readOnly = true)
    public List<SessionResponse> listActiveSessions(UUID userUniqueId, UUID currentSid) {
        User user = userRepository.findByUniqueId(userUniqueId)
            .orElseThrow(() -> new ResourceNotFoundException("USER_NOT_FOUND", "User not found."));

        return repository.findActiveByUserId(user.getId(), LocalDateTime.now()).stream()
            .map(session -> sessionMapper.toResponse(session, currentSid))
            .toList();
    }

    /**
     * Deletes sessions that expired or were revoked more than retentionDays ago,
     * together with their used token hashes. Active sessions are never touched.
     */
    @Transactional
    public int cleanupEndedSessions(int retentionDays, int limit) {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(retentionDays);
        return repository.deleteEndedBefore(cutoff, limit);
    }

    /**
     * Token is not the current one of any session. If it was rotated out
     * before, someone is replaying it, so revoke the session it belonged to.
     */
    private BadCredentialsException handleUnknownToken(String hash) {
        return usedRefreshTokenRepository.findById(hash)
            .<BadCredentialsException>map(used -> {
                // Reading the id of a lazy proxy does not hit the database
                Long sessionId = used.getSession().getId();
                repository.revoke(sessionId, LocalDateTime.now());

                log.warn("Refresh token reuse detected, revoked session {}", sessionId);
                return new RefreshTokenReuseException("Refresh token reuse detected");
            })
            .orElseGet(() -> new BadCredentialsException("Invalid Refresh Token"));
    }

    /**
     * The User-Agent header is client-controlled metadata, so an overlong
     * value is cut to fit the column instead of failing the login.
     */
    private static String truncateUserAgent(String userAgent) {
        if (userAgent == null || userAgent.length() <= MAX_USER_AGENT_LENGTH) {
            return userAgent;
        }
        return userAgent.substring(0, MAX_USER_AGENT_LENGTH);
    }
}
