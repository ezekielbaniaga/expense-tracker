package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Expense;
import jakarta.transaction.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExpenseRepository extends JpaRepository<Expense, Long> {

    // Every lookup is scoped to the owner, so users only ever see their own expenses
    @Query("SELECT e FROM Expense e WHERE e.ownerId = :ownerId AND (e.archived IS NULL OR e.archived = FALSE)")
    List<Expense> findActiveByOwnerId(@Param("ownerId") UUID ownerId);

    Optional<Expense> findByUniqueIdAndOwnerId(UUID uniqueId, UUID ownerId);

    List<Expense> findAllByOwnerIdAndArchivedIsTrue(UUID ownerId);

    // Using Native Query as JPQL does not support LIMIT in DELETE
    @Modifying
    @Query(value = """
        DELETE FROM expense
        WHERE id IN (
            SELECT id FROM expense
            WHERE archived = TRUE AND archived_at < :cutoff
            LIMIT :limit
        )
    """, nativeQuery = true)
    int deleteOldExpense(@Param("cutoff")LocalDateTime cutoff, @Param("limit") int limit);
}
