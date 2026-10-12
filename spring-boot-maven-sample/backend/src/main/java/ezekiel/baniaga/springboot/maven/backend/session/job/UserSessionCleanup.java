package ezekiel.baniaga.springboot.maven.backend.session.job;

import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class UserSessionCleanup {

    // Keep ended sessions for 7 days (e.g. to look into a reuse incident), then delete them
    private static final int RETENTION_DAYS = 7;
    private static final int MAX_ROWS_DELETE = 1000;

    private final UserSessionService userSessionService;

    public UserSessionCleanup(UserSessionService userSessionService) {
        this.userSessionService = userSessionService;
    }

    // For every minute at 3AM (after the 2AM expense cleanup), delete up to MAX_ROWS_DELETE sessions
    @Scheduled(cron = "0 * 3 * * *")
    public void cleanup() {
        log.info("Cleaning Ended User Sessions...");
        int affectedRows = userSessionService.cleanupEndedSessions(RETENTION_DAYS, MAX_ROWS_DELETE);
        log.info("Affected Rows: {}", affectedRows);
    }

}
