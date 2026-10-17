package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public record ArchivedExpenseListItemResponse(
    UUID id,
    String description,
    BigDecimal amount,
    LocalDateTime archivedAt
){ }
