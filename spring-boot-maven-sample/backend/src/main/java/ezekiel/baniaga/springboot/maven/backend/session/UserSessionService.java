package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.common.ResourceNotFoundException;
import ezekiel.baniaga.springboot.maven.backend.session.dto.SessionResponse;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UsedRefreshToken;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.session.mapper.SessionMapper;
import ezekiel.baniaga.springboot.maven.backend.session.props.SessionProperties;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserSessionService {

    // Matches user_sessions.user_agent VARCHAR(500) (V7)
    private static final int MAX_USER_AGENT_LENGTH = 500;
    private static final int MAX_IP_ADDRESS_LENGTH = 45;

    // Used token hashes kept per session for reuse detection; older ones are
    // deleted on rotation, so an endless refresh loop can't grow the table
    static final int MAX_USED_TOKENS_PER_SESSION = 20;

    private final UserRepository userRepository;
    private final UserSessionRepository repository;
    private final UsedRefreshTokenRepository usedRefreshTokenRepository;
    private final CustomUserDetailsMapper customUserDetailsMapper;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final RefreshTokenHasher refreshTokenHasher;
    private final SessionMapper sessionMapper;
    private final SessionProperties sessionProperties;
    private final Clock clock;

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
     *
     * At most app.session.max-active sessions stay active: when the user already has that
     * many, the least recently used ones are revoked first, so the new login
     * always succeeds. The user row is locked (SELECT ... FOR UPDATE) for the
     * transaction, so concurrent logins of one user count one after another;
     * without it each would see room under the cap and all would insert.
     * Lock order is the user row, then sessions. Refresh locks only its session
     * row, so the two can't deadlock.
     *
     * authenticated is the user as AuthenticationManager loaded it. Under the
     * lock the user is read again: if it was disabled or its password hash
     * changed since, the login is rejected (DisabledException /
     * BadCredentialsException, 401) and no session is created.
     */
    @Transactional
    public CreatedSession createSession(
            CustomUserDetails authenticated,
            String userAgent,
            String ipAddress) {

        String rawRefreshToken = refreshTokenGenerator.generate();
        String hashedRefreshToken = refreshTokenHasher.hash(rawRefreshToken);
        LocalDateTime now = LocalDateTime.now(clock);

        Long userId = authenticated.getDatabaseId();
        User user = userRepository.findLockedById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("USER_NOT_FOUND", "User not found."));

        // The password was checked before this lock. A password change or disable
        // that committed since then already ran revokeAllForUser, so a session
        // created now would survive it. Compare the hash, not last_modified: a
        // role change sets that too and must not fail the login.
        if (!user.isEnabled()) {
            throw new DisabledException("User account is disabled");
        }
        if (!Objects.equals(user.getPassword(), authenticated.getPassword())) {
            throw new BadCredentialsException("Bad credentials");
        }

        revokeLeastRecentlyUsedOverCap(userId, now);

        UserSession session = new UserSession();
        // Random v4: a session id must not reveal when the session was created
        session.setUniqueId(UUID.randomUUID());
        session.setUser(user);
        session.setRefreshTokenHash(hashedRefreshToken);
        session.setUserAgent(truncate(userAgent, MAX_USER_AGENT_LENGTH));
        session.setIpAddress(truncate(ipAddress, MAX_IP_ADDRESS_LENGTH));
        session.setCreatedAt(now);
        session.setLastUsedAt(now);
        session.setExpiresAt(now.plus(sessionProperties.getLifetime()));

        repository.save(session);

        return new CreatedSession(
            rawRefreshToken,
            session.getUniqueId(),
            customUserDetailsMapper.toCustomUserDetails(user)
        );
    }

    /**
     * Swaps the refresh token for a new one. The old hash is remembered
     * so presenting it again can be detected as token theft. Only the newest
     * MAX_USED_TOKENS_PER_SESSION hashes are kept; an older token is then
     * unknown (plain 401, session untouched) instead of reuse.
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

        if (userSession.getExpiresAt().isBefore(LocalDateTime.now(clock))) {
            throw new BadCredentialsException("Refresh token has expired");
        }

        // Access tokens can't be recalled, but a disabled user must not get new ones.
        // Revoke so re-enabling the account doesn't bring this session back.
        if (!userSession.getUser().isEnabled()) {
            repository.revoke(userSession.getId(), LocalDateTime.now(clock));
            throw new DisabledException("User account is disabled");
        }

        String newRawRefreshToken = refreshTokenGenerator.generate();
        String newHash = refreshTokenHasher.hash(newRawRefreshToken);
        LocalDateTime now = LocalDateTime.now(clock);

        usedRefreshTokenRepository.save(
            new UsedRefreshToken(oldHash, userSession, now));
        // Bounded per session: /auth/refresh has no rate limit, and a token
        // older than these is no longer current, so a plain 401 is enough
        usedRefreshTokenRepository.deleteAllButNewest(userSession.getId(), MAX_USED_TOKENS_PER_SESSION);

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
     *
     * An already-rotated token still identifies its session: a client that
     * lost a refresh response, or a stale second tab, logs out with the old
     * token and expects to be logged out. That is the owner ending the
     * session, not a replay, so no reuse warning is logged.
     *
     * Unknown tokens are ignored, and the controller always answers 204,
     * so the caller can't tell valid tokens from invalid ones.
     */
    @Transactional
    public void revokeSession(String rawRefreshToken) {
        String hash = refreshTokenHasher.hash(rawRefreshToken);

        repository.findByRefreshTokenHash(hash)
            .map(UserSession::getId)
            // Reading the id of a lazy proxy does not hit the database
            .or(() -> usedRefreshTokenRepository.findById(hash).map(used -> used.getSession().getId()))
            .ifPresent(sessionId -> repository.revoke(sessionId, LocalDateTime.now(clock)));
    }

    /**
     * Ends every active session of the user, e.g. after a password change.
     * Their refresh tokens stop working; access tokens already issued stay
     * valid until they expire.
     */
    @Transactional
    public int revokeAllForUser(Long userId) {
        return repository.revokeAllForUser(userId, LocalDateTime.now(clock));
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

        repository.revoke(session.getId(), LocalDateTime.now(clock));

        log.info("Revoked session {} of user {}", sessionId, userUniqueId);
    }

    /**
     * "Log out everywhere else": revokes every active session of the user except
     * currentSid, the caller's own. Returns how many were revoked, so a
     * repeated call returns 0.
     *
     * A token without a sid (issued before the claim existed) can't say which
     * session is its own, so every session is revoked. Comparing against a
     * null sid in SQL would match nothing and silently revoke none.
     */
    @Transactional
    public int revokeOtherSessions(UUID userUniqueId, UUID currentSid) {
        User user = userRepository.findByUniqueId(userUniqueId)
            .orElseThrow(() -> new ResourceNotFoundException("USER_NOT_FOUND", "User not found."));

        LocalDateTime now = LocalDateTime.now(clock);
        int revoked = currentSid == null
            ? repository.revokeAllForUser(user.getId(), now)
            : repository.revokeAllForUserExcept(user.getId(), currentSid, now);

        log.info("Revoked {} other session(s) of user {}", revoked, userUniqueId);
        return revoked;
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

        return repository.findActiveByUserId(user.getId(), LocalDateTime.now(clock)).stream()
            .map(session -> sessionMapper.toResponse(session, currentSid))
            .toList();
    }

    /**
     * Deletes sessions that expired or were revoked more than retention ago,
     * together with their used token hashes. Active sessions are never touched.
     */
    @Transactional
    public int cleanupEndedSessions(Duration retention, int limit) {
        LocalDateTime cutoff = LocalDateTime.now(clock).minus(retention);
        return repository.deleteEndedBefore(cutoff, limit);
    }

    /**
     * Makes room for one more session: revokes the least recently used active
     * sessions until app.session.max-active - 1 are left. Must run under the user
     * row lock taken by createSession.
     */
    private void revokeLeastRecentlyUsedOverCap(Long userId, LocalDateTime now) {
        List<Long> active = repository.findActiveIdsLeastRecentlyUsedFirst(userId, now);
        int excess = active.size() - (sessionProperties.getMaxActive() - 1);
        if (excess <= 0) {
            return;
        }

        int revoked = repository.revokeAll(active.subList(0, excess), now);
        log.info("Session cap reached, revoked {} least recently used session(s) of user {}", revoked, userId);
    }

    /**
     * Token is not the current one of any session. If it was rotated out
     * before and its session is still active, someone is replaying it, so
     * revoke the session and WARN. If the session already ended (logged out,
     * revoked or expired), there is nothing left to protect: a plain 401,
     * logged at DEBUG, so the WARN stays a meaningful theft alert and the
     * original revocation time is kept.
     */
    private BadCredentialsException handleUnknownToken(String hash) {
        return usedRefreshTokenRepository.findById(hash)
            .<BadCredentialsException>map(used -> {
                UserSession session = used.getSession();
                LocalDateTime now = LocalDateTime.now(clock);

                // revoke only stamps a session that isn't revoked yet, so of
                // concurrent replays exactly one counts as the reuse
                boolean active = session.getExpiresAt().isAfter(now);
                if (active && repository.revoke(session.getId(), now) > 0) {
                    log.warn("Refresh token reuse detected, revoked session {}", session.getId());
                    return new RefreshTokenReuseException("Refresh token reuse detected");
                }

                log.debug("Rotated refresh token replayed on ended session {}", session.getId());
                return new BadCredentialsException("Refresh token has been revoked or expired");
            })
            .orElseGet(() -> new BadCredentialsException("Invalid Refresh Token"));
    }

    /**
     * The User-Agent and client address are metadata the client can influence
     * (an IPv6 zone id, later a forwarded header), so an overlong value is cut
     * to fit its column instead of failing the login.
     */
    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}
