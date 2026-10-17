package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import java.math.BigDecimal;
import java.util.List;

public record ExpenseListResponseV1_2 (
    List<ExpenseListItemResponseV1_2> expenses,
    int count,
    BigDecimal total_amount
){}
