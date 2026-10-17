package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import java.util.List;

public record ArchivedExpenseListResponse (
    List<ArchivedExpenseListItemResponse> expenses,
    int count
){}
