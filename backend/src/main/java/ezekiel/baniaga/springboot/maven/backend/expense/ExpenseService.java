package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.common.BadRequestException;
import ezekiel.baniaga.springboot.maven.backend.common.BusinessRuleException;
import ezekiel.baniaga.springboot.maven.backend.common.LikeEscaper;
import ezekiel.baniaga.springboot.maven.backend.common.ResourceNotFoundException;
import ezekiel.baniaga.springboot.maven.backend.config.DefaultUUIDGenerator;
import ezekiel.baniaga.springboot.maven.backend.expense.dto.*;
import ezekiel.baniaga.springboot.maven.backend.expense.entity.Category;
import ezekiel.baniaga.springboot.maven.backend.expense.entity.Expense;
import ezekiel.baniaga.springboot.maven.backend.expense.mapper.ExpenseMapper;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ExpenseService {

    private final ExpenseRepository repository;
    private final ExpenseMapper expenseMapper;
    private final DefaultUUIDGenerator uuidGenerator;
    private final Clock clock;

    static final int MAX_PAGE_SIZE = 100;
    static final int MAX_QUERY_LENGTH = 100;

    public record ListFilters(String q, List<String> category, LocalDate from, LocalDate to,
                              BigDecimal minAmount, BigDecimal maxAmount) {
    }

    // API sort field -> entity attribute
    private static final Map<String, String> SORT_FIELDS = Map.of(
        "date", "expenseDate",
        "amount", "amount",
        "description", "description",
        "category", "category",
        "createdAt", "createdAt");

    public ExpenseResponse getExpenseByUniqueId(UUID uniqueId, UUID ownerId) {
        Expense expense = findExpenseOrThrow(uniqueId, ownerId);
        // Only the read hides archived rows; PUT/PATCH/DELETE need to find them to answer 409 MODIFY_ARCHIVED
        if (Boolean.TRUE.equals(expense.getArchived())) {
            throw new ResourceNotFoundException("EXPENSE_NOT_FOUND", "Expense not found");
        }
        return expenseMapper.toResponse(expense);
    }

    @Transactional
    public ExpenseResponse updateExpense(UUID uniqueId, UUID ownerId, UpdateExpenseRequest request) {
        Expense expense = findExpenseOrThrow(uniqueId, ownerId);

        checkVersion(expense, request.version());
        checkIfArchived(expense);

        expense = expenseMapper.toEntity(request, expense);
        expense.setLastModified(LocalDateTime.now(clock));

        // Using saveAndFlush to get latest version field incremented by Hibernate
        return expenseMapper.toResponse(repository.saveAndFlush(expense));
    }

    @Transactional
    public ExpenseResponse patchExpenseDescription(UUID uniqueId, UUID ownerId, PatchExpenseDescriptionRequest request) {
        Expense expense = findExpenseOrThrow(uniqueId, ownerId);

        checkVersion(expense, request.version());
        checkIfArchived(expense);

        expense.setDescription(request.description());
        expense.setLastModified(LocalDateTime.now(clock));

        return expenseMapper.toResponse(repository.saveAndFlush(expense));
    }

    // Same rules as update/patch: matching version, and archived expenses are read-only
    @Transactional
    public void deleteExpense(UUID uniqueId, UUID ownerId, Long version) {
        Expense expense = findExpenseOrThrow(uniqueId, ownerId);

        checkVersion(expense, version);
        checkIfArchived(expense);

        // repository.delete(expense); --> hard delete
        expense.setArchived(true);
        expense.setArchivedAt(LocalDateTime.now(clock));
        repository.save(expense);
    }

    public ExpenseListResponse getAllExpenses(UUID ownerId) {
        List<ExpenseListItemResponse> expensesResponse = findAllExpensesAndMapToListItem(ownerId);

        return new ExpenseListResponse(
            expensesResponse, expensesResponse.size());
    }

    public ExpenseListResponseV1_1 getAllExpensesV1_1(UUID ownerId) {
        List<ExpenseListItemResponse> expensesResponse = findAllExpensesAndMapToListItem(ownerId);

        int count = expensesResponse.size();
        // Expenses saved before amount was required can have no amount; skip them in the total
        BigDecimal total_amount = expensesResponse.stream()
                .map(ExpenseListItemResponse::amount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new ExpenseListResponseV1_1(
                expensesResponse, count, total_amount);
    }

    // Newest expense date first; the newest-created breaks ties between expenses on the same date
    public ExpenseListResponseV1_2 getAllExpensesV1_2(UUID ownerId) {
        List<ExpenseListItemResponseV1_2> expensesResponse = repository.findActiveByOwnerId(ownerId)
            .stream()
            .sorted(Comparator.comparing(Expense::getExpenseDate, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(Expense::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .map(expenseMapper::toListItemV1_2).toList();

        // Expenses saved before amount was required can have no amount; skip them in the total
        BigDecimal total_amount = expensesResponse.stream()
                .map(ExpenseListItemResponseV1_2::amount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new ExpenseListResponseV1_2(
                expensesResponse, expensesResponse.size(), total_amount);
    }

    @Transactional(readOnly = true)
    public ExpenseListResponseV1_3 getExpensesV1_3(UUID ownerId, int page, int size, String sort, ListFilters f) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException("INVALID_PAGE",
                "page must be 0 or more and size between 1 and " + MAX_PAGE_SIZE + ".");
        }
        String[] parts = sort.split(",", -1);
        String attribute = SORT_FIELDS.get(parts[0].trim());
        String dir = parts.length == 1 ? "asc" : parts[1].trim().toLowerCase();
        if (attribute == null || parts.length > 2 || !(dir.equals("asc") || dir.equals("desc"))) {
            throw new BadRequestException("INVALID_SORT",
                "sort must be field,dir with field one of " + String.join(", ", SORT_FIELDS.keySet().stream().sorted().toList())
                    + " and dir asc or desc.");
        }
        boolean ascending = dir.equals("asc");

        String q = f.q() == null || f.q().isBlank() ? null : f.q();
        if (q != null && q.length() > MAX_QUERY_LENGTH) {
            throw new BadRequestException("VALIDATION_ERROR", "q must be at most " + MAX_QUERY_LENGTH + " characters.");
        }
        List<Category> categories = f.category() == null ? List.of()
            : f.category().stream().map(ExpenseMapper::parseCategory).toList();
        if (f.from() != null && f.to() != null && f.from().isAfter(f.to())) {
            throw new BadRequestException("INVALID_DATE_RANGE", "from must not be after to.");
        }
        if (f.minAmount() != null && f.maxAmount() != null && f.minAmount().compareTo(f.maxAmount()) > 0) {
            throw new BadRequestException("INVALID_AMOUNT_RANGE", "minAmount must not be more than maxAmount.");
        }

        // Comparisons and IN never match NULL, so legacy rows without a date or amount drop out of those filters
        Specification<Expense> filters = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("ownerId"), ownerId));
            p.add(cb.or(cb.isNull(root.get("archived")), cb.isFalse(root.get("archived"))));
            if (q != null) {
                p.add(cb.like(cb.lower(root.get("description")),
                    "%" + LikeEscaper.escape(q.toLowerCase()) + "%", '\\'));
            }
            if (!categories.isEmpty()) {
                p.add(root.get("category").in(categories));
            }
            if (f.from() != null) {
                p.add(cb.greaterThanOrEqualTo(root.<LocalDate>get("expenseDate"), f.from()));
            }
            if (f.to() != null) {
                p.add(cb.lessThanOrEqualTo(root.<LocalDate>get("expenseDate"), f.to()));
            }
            if (f.minAmount() != null) {
                p.add(cb.greaterThanOrEqualTo(root.<BigDecimal>get("amount"), f.minAmount()));
            }
            if (f.maxAmount() != null) {
                p.add(cb.lessThanOrEqualTo(root.<BigDecimal>get("amount"), f.maxAmount()));
            }
            return cb.and(p.toArray(new Predicate[0]));
        };

        // Sorting is done here, not through Pageable: NULLs must come last both ways (PostgreSQL puts
        // them first on DESC), and the count query must not carry an ORDER BY
        Specification<Expense> ordered = (root, query, cb) -> {
            if (Expense.class.equals(query.getResultType())) {
                Expression<?> field = root.get(attribute);
                List<Order> orders = new ArrayList<>();
                orders.add(cb.asc(cb.selectCase().when(cb.isNull(field), 1).otherwise(0)));
                orders.add(ascending ? cb.asc(field) : cb.desc(field));
                orders.add(cb.desc(root.get("createdAt")));
                orders.add(cb.desc(root.get("id")));
                query.orderBy(orders);
            }
            return filters.toPredicate(root, query, cb);
        };

        Page<Expense> result = repository.findAll(ordered, PageRequest.of(page, size));
        return new ExpenseListResponseV1_3(
            result.getContent().stream().map(expenseMapper::toListItemV1_2).toList(),
            page, size, result.getTotalElements(), result.getTotalPages(),
            repository.sumAmount(filters));
    }

    @Transactional(readOnly = true)
    public ExpenseSummaryResponse getSummary(UUID ownerId, LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new BadRequestException("INVALID_DATE_RANGE", "from must not be after to.");
        }
        Specification<Expense> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.equal(root.get("ownerId"), ownerId));
            p.add(cb.or(cb.isNull(root.get("archived")), cb.isFalse(root.get("archived"))));
            if (from != null) {
                p.add(cb.greaterThanOrEqualTo(root.<LocalDate>get("expenseDate"), from));
            }
            if (to != null) {
                p.add(cb.lessThanOrEqualTo(root.<LocalDate>get("expenseDate"), to));
            }
            return cb.and(p.toArray(new Predicate[0]));
        };
        // Largest total first; equal totals ordered by category name, the uncategorized group last
        List<ExpenseSummaryResponse.CategoryTotal> groups = repository.totalsByCategory(spec).stream()
            .map(t -> new ExpenseSummaryResponse.CategoryTotal(t.category(), t.count(), t.totalAmount()))
            .sorted(Comparator.comparing(ExpenseSummaryResponse.CategoryTotal::totalAmount).reversed()
                .thenComparing(ExpenseSummaryResponse.CategoryTotal::category,
                    Comparator.nullsLast(Comparator.naturalOrder())))
            .toList();
        long count = groups.stream().mapToLong(ExpenseSummaryResponse.CategoryTotal::count).sum();
        BigDecimal total = groups.stream().map(ExpenseSummaryResponse.CategoryTotal::totalAmount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ExpenseSummaryResponse(from, to, count, total, groups);
    }

    public ArchivedExpenseListResponse getArchivedExpenses(UUID ownerId) {
        List<ArchivedExpenseListItemResponse> expensesResponse = repository.findAllByOwnerIdAndArchivedIsTrue(ownerId)
                .stream().map(expenseMapper::toArchivedListItem).toList();

        return new ArchivedExpenseListResponse(expensesResponse, expensesResponse.size());
    }

    public ExpenseResponse addExpense(CreateExpenseRequest request, UUID ownerId) {
        Expense expense = expenseMapper.toEntity(request);
        expense.setOwnerId(ownerId);

        UUID uuid = uuidGenerator.generate();
        expense.setUniqueId(uuid);
        expense.setCreatedAt(LocalDateTime.now(clock));
        return expenseMapper.toResponse(repository.save(expense));
    }

    public AllCategoriesResponse getAllCategories() {
        return new AllCategoriesResponse(
            Category.values());
    }

    private void checkIfArchived(Expense expense) {
        if (Boolean.TRUE.equals(expense.getArchived())) {
            throw new BusinessRuleException("MODIFY_ARCHIVED","Cannot modify archived expense");
        }
    }

    private void checkVersion(Expense expense, Long version) {
        if (!expense.getVersion().equals(version)) {
            throw new BusinessRuleException("CONCURRENT_MODIFICATION","Expense was modified by another user");
        }
    }

    private List<ExpenseListItemResponse> findAllExpensesAndMapToListItem(UUID ownerId) {
        return repository.findActiveByOwnerId(ownerId)
            .stream().map(expenseMapper::toListItem).toList();
    }

    // Someone else's expense looks exactly like a missing one (404), so ids can't be probed
    private Expense findExpenseOrThrow(UUID uniqueId, UUID ownerId) {
        return repository.findByUniqueIdAndOwnerId(uniqueId, ownerId)
                .orElseThrow(()->new ResourceNotFoundException("EXPENSE_NOT_FOUND", "Expense not found"));
    }

    @Transactional
    public int cleanupArchived(int retentionMaxDays, int limit) {
        LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(retentionMaxDays);
        return repository.deleteOldExpense(cutoff, limit);
    }

}
