package ezekiel.baniaga.springboot.maven.backend.session.job;

import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import ezekiel.baniaga.springboot.maven.backend.session.props.SessionProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class UserSessionCleanup {

    private static final int BATCH_SIZE = 1000;
    private static final int MAX_BATCHES = 100;

    private final UserSessionService userSessionService;
    private final SessionProperties sessionProperties;

    public UserSessionCleanup(UserSessionService userSessionService, SessionProperties sessionProperties) {
        this.userSessionService = userSessionService;
        this.sessionProperties = sessionProperties;
    }

    // Once at 3AM (after the 2AM expense cleanup). Deletes in batches of
    // BATCH_SIZE until a batch comes back short, so a night's backlog is
    // cleared in one run; MAX_BATCHES stops a run that can't keep up from
    // spinning forever. Each cleanupEndedSessions call goes through the
    // UserSessionService proxy, so every batch is its own transaction and
    // locks are released between batches.
    @Scheduled(cron = "0 0 3 * * *")
    public void cleanup() {
        log.info("Cleaning ended user sessions...");
        int total = 0;
        int batches = 0;
        int deleted;
        do {
            deleted = userSessionService.cleanupEndedSessions(sessionProperties.getRetention(), BATCH_SIZE);
            total += deleted;
            batches++;
        } while (deleted == BATCH_SIZE && batches < MAX_BATCHES);

        if (deleted == BATCH_SIZE) {
            log.warn("Deleted {} ended user sessions in {} batches; stopped at the batch cap, the rest waits for the next run",
                total, batches);
        } else {
            log.info("Deleted {} ended user sessions in {} batch(es)", total, batches);
        }
    }

}
