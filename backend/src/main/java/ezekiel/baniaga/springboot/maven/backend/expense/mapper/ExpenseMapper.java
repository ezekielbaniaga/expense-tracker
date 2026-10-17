package ezekiel.baniaga.springboot.maven.backend.expense.mapper;

import ezekiel.baniaga.springboot.maven.backend.common.BadRequestException;
import ezekiel.baniaga.springboot.maven.backend.expense.dto.*;
import ezekiel.baniaga.springboot.maven.backend.expense.entity.Category;
import ezekiel.baniaga.springboot.maven.backend.expense.entity.Expense;
import org.springframework.stereotype.Component;

@Component
public class ExpenseMapper {

    public Expense toEntity(CreateExpenseRequest request) {
        Expense expense = new Expense();
        expense.setAmount(request.amount());
        expense.setCategory(parseCategory(request.category()));
        expense.setDescription(request.description());
        expense.setExpenseDate(request.date());
        return expense;
    }

    public Expense toEntity(UpdateExpenseRequest request, Expense expenseFromDb) {
        expenseFromDb.setAmount(request.amount());
        expenseFromDb.setCategory(parseCategory(request.category()));
        expenseFromDb.setDescription(request.description());
        expenseFromDb.setExpenseDate(request.date());

        return expenseFromDb;
    }

    public ExpenseResponse toResponse(Expense expense) {
        return new ExpenseResponse(
            expense.getUniqueId(),
            expense.getVersion(),
            expense.getDescription(),
            expense.getAmount(),
            expense.getCategory(),
            expense.getExpenseDate(),
            expense.getCreatedAt(),
            expense.getLastModified());
    }

    public ExpenseListItemResponse toListItem(Expense expense) {
        return new ExpenseListItemResponse(
            expense.getUniqueId(),
            expense.getDescription(),
            expense.getAmount());
    }

    public ArchivedExpenseListItemResponse toArchivedListItem(Expense expense) {
        return new ArchivedExpenseListItemResponse(
            expense.getUniqueId(),
            expense.getDescription(),
            expense.getAmount(),
            expense.getArchivedAt());
    }

    private static Category parseCategory(String value) {
        if (value == null) return null;

        try {
            return Category.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException("INVALID_CATEGORY", "Invalid category: " + value);
        }

    }
}
