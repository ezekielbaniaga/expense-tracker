package ezekiel.baniaga.springboot.maven.backend.expense.job;

import ezekiel.baniaga.springboot.maven.backend.expense.ExpenseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class ExpenseCleanup {

    // 30 days retention policy for archived expenses
    private static final int RETENTION_MAX_DAYS = 30;
    private static final int BATCH_SIZE = 1000;
    private static final int MAX_BATCHES = 100;

    private final ExpenseService expenseService;

    public ExpenseCleanup(ExpenseService expenseService) {
        this.expenseService = expenseService;
    }

    // Once at 2AM. Deletes in batches of BATCH_SIZE until a batch comes back
    // short, so a night's backlog is cleared in one run; MAX_BATCHES stops a
    // run that can't keep up from spinning forever. Each cleanupArchived call
    // goes through the ExpenseService proxy, so every batch is its own
    // transaction and locks are released between batches.
    @Scheduled(cron = "0 0 2 * * *")
    public void cleanup() {
        log.info("Cleaning Archived Expenses...");
        int total = 0;
        int batches = 0;
        int deleted;
        do {
            deleted = expenseService.cleanupArchived(RETENTION_MAX_DAYS, BATCH_SIZE);
            total += deleted;
            batches++;
        } while (deleted == BATCH_SIZE && batches < MAX_BATCHES);

        if (deleted == BATCH_SIZE) {
            log.warn("Deleted {} archived expenses in {} batches; stopped at the batch cap, the rest waits for the next run",
                total, batches);
        } else {
            log.info("Deleted {} archived expenses in {} batch(es)", total, batches);
        }
    }

}
