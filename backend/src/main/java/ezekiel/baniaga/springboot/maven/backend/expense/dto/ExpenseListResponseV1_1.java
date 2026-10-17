package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import java.math.BigDecimal;
import java.util.List;

public record ExpenseListResponseV1_1 (
    List<ExpenseListItemResponse> expenses,
    int count,
    BigDecimal total_amount
){}
