package ezekiel.baniaga.springboot.maven.backend.session.mapper;

import ezekiel.baniaga.springboot.maven.backend.session.dto.SessionResponse;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class SessionMapper {

    /**
     * @param currentSid the sid of the caller's access token; null for tokens
     *                   issued before the claim existed, so nothing is current
     */
    public SessionResponse toResponse(UserSession session, UUID currentSid) {
        return new SessionResponse(
            session.getUniqueId(),
            session.getCreatedAt(),
            session.getLastUsedAt(),
            session.getExpiresAt(),
            session.getUserAgent(),
            session.getIpAddress(),
            session.getUniqueId().equals(currentSid));
    }
}
