package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class UserSessionService {

    private final UserRepository userRepository;
    private final UserSessionRepository repository;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final RefreshTokenHasher refreshTokenHasher;

    /**
     * Creates a new session and saves to db for
     * controlling session later like revocation
     *
     * Note: Raw refresh token is returned but
     * never saved to db for security.
     *
        rawRefreshToken
           │
           ├──▶ Client
           │
           └──▶ NEVER database
     */
    public String createSession(
            Long userId,
            String userAgent,
            String ipAddress) {

        String rawRefreshToken = refreshTokenGenerator.generate();
        String hashedRefreshToken = refreshTokenHasher.hash(rawRefreshToken);
        LocalDateTime now = LocalDateTime.now();

        //This creates a reference/proxy without immediately querying the database.
        User user = userRepository.getReferenceById(userId);

        UserSession session = new UserSession();
        session.setUser(user);
        session.setRefreshTokenHash(hashedRefreshToken);
        session.setUserAgent(userAgent);
        session.setIpAddress(ipAddress);
        session.setCreatedAt(now);
        session.setLastUsedAt(now);
        session.setExpiresAt(now.plusDays(30));

        repository.save(session);

        return rawRefreshToken;
    }

    public RefreshTokenResult rotateRefreshToken(String rawRefreshToken) {

        String oldHash = refreshTokenHasher.hash(rawRefreshToken);

        UserSession userSession = repository.findByRefreshTokenHash(oldHash)
            .orElseThrow(()->new BadCredentialsException("Invalid Refresh Token"));

        if (userSession.getRevokedAt() != null) {
            throw new BadCredentialsException("Refresh token has been revoked");
        }

        if (userSession.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BadCredentialsException("Refresh token has expired");
        }

        String newRawRefreshToken = refreshTokenGenerator.generate();
        String newHash = refreshTokenHasher.hash(newRawRefreshToken);

        userSession.setRefreshTokenHash(newHash);
        userSession.setLastUsedAt(LocalDateTime.now());

        repository.save(userSession);

        return new RefreshTokenResult(
            userSession.getUser(),
            newRawRefreshToken
        );
    }

}
