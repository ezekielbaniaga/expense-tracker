package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CreateExpenseRequest (

    @NotBlank
    @Size(max=250)
    @ezekiel.baniaga.springboot.maven.backend.common.NoControlChars
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
