package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Category;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

public record ExpenseResponse (
    UUID id,
    Long version,
    String description,
    BigDecimal amount,
    Category category,
    LocalDate date,
    LocalDateTime createdAt,
    LocalDateTime lastModified
){}
