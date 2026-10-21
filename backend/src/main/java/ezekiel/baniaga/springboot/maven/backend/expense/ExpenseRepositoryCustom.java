package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Expense;
import org.springframework.data.jpa.domain.Specification;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Category;

import java.math.BigDecimal;
import java.util.List;

public interface ExpenseRepositoryCustom {

    // SUM(amount) over every row the specification matches; rows without an amount are skipped, none gives zero
    BigDecimal sumAmount(Specification<Expense> spec);

    // One row per category (null included) over the rows the specification matches: row count and SUM(amount),
    // where rows without an amount are counted but add nothing; the sum is zero when none has an amount
    List<CategoryTotal> totalsByCategory(Specification<Expense> spec);

    record CategoryTotal(Category category, long count, BigDecimal totalAmount) {
    }
}
