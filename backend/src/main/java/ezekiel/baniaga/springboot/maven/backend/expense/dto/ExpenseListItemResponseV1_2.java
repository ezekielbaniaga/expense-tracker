package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Category;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseListItemResponseV1_2 (
    UUID id,
    String description,
    BigDecimal amount,
    Category category,
    LocalDate date,
    Long version
){}
