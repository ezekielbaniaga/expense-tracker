package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Expense;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Root;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;

public class ExpenseRepositoryCustomImpl implements ExpenseRepositoryCustom {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public BigDecimal sumAmount(Specification<Expense> spec) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<BigDecimal> query = cb.createQuery(BigDecimal.class);
        Root<Expense> root = query.from(Expense.class);
        query.select(cb.sum(root.<BigDecimal>get("amount")));
        query.where(spec.toPredicate(root, query, cb));
        BigDecimal sum = entityManager.createQuery(query).getSingleResult();
        return sum == null ? BigDecimal.ZERO : sum;
    }
}
