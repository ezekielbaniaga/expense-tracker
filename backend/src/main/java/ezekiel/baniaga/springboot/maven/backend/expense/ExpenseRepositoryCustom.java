package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Expense;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;

public interface ExpenseRepositoryCustom {

    // SUM(amount) over every row the specification matches; rows without an amount are skipped, none gives zero
    BigDecimal sumAmount(Specification<Expense> spec);
}
