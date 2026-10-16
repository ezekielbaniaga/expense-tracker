package ezekiel.baniaga.springboot.maven.backend.session.job;

import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import ezekiel.baniaga.springboot.maven.backend.session.props.SessionProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class UserSessionCleanup {

    private static final int MAX_ROWS_DELETE = 1000;

    private final UserSessionService userSessionService;
    private final SessionProperties sessionProperties;

    public UserSessionCleanup(UserSessionService userSessionService, SessionProperties sessionProperties) {
        this.userSessionService = userSessionService;
        this.sessionProperties = sessionProperties;
    }

    // For every minute at 3AM (after the 2AM expense cleanup), delete up to MAX_ROWS_DELETE sessions
    @Scheduled(cron = "0 * 3 * * *")
    public void cleanup() {
        log.info("Cleaning Ended User Sessions...");
        int affectedRows = userSessionService.cleanupEndedSessions(sessionProperties.getRetention(), MAX_ROWS_DELETE);
        log.info("Affected Rows: {}", affectedRows);
    }

}
