package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record ExpenseListItemResponse (
    UUID id,
    String description,
    BigDecimal amount
){}
