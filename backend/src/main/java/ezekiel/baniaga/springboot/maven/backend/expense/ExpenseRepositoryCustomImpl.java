package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Expense;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Root;
import org.springframework.data.jpa.domain.Specification;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Category;
import jakarta.persistence.Tuple;

import java.math.BigDecimal;
import java.util.List;

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

    @Override
    public List<CategoryTotal> totalsByCategory(Specification<Expense> spec) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = cb.createTupleQuery();
        Root<Expense> root = query.from(Expense.class);
        query.multiselect(root.<Category>get("category").alias("category"),
            cb.count(root).alias("cnt"),
            cb.sum(root.<BigDecimal>get("amount")).alias("total"));
        query.where(spec.toPredicate(root, query, cb));
        query.groupBy(root.get("category"));
        return entityManager.createQuery(query).getResultList().stream()
            .map(t -> new CategoryTotal(t.get("category", Category.class), t.get("cnt", Long.class),
                t.get("total", BigDecimal.class) == null ? BigDecimal.ZERO : t.get("total", BigDecimal.class)))
            .toList();
    }
}
