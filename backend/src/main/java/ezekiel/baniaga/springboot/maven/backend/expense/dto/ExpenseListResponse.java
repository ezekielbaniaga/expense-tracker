package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import java.util.List;

public record ExpenseListResponse (
    List<ExpenseListItemResponse> expenses,
    int total
){}
