package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;

public record UpdateExpenseRequest (

    @PositiveOrZero
    Long version,

    @NotBlank
    @Size(max=250)
    String description,

    @NotNull
    @Positive
    // Matches the NUMERIC(10,2) column: larger values overflow, extra decimals would be rounded
    @Digits(integer = 8, fraction = 2)
    BigDecimal amount,

    @NotBlank
    String category,

    @NotNull
    @PastOrPresent
    LocalDate date

){}
