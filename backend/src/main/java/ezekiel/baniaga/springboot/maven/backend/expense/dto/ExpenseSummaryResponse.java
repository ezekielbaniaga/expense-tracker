package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import ezekiel.baniaga.springboot.maven.backend.expense.entity.Category;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

// from and to echo the request (null = all time); expenses without an amount are counted but add nothing to sums
public record ExpenseSummaryResponse(
    LocalDate from,
    LocalDate to,
    long count,
    @JsonProperty("total_amount") BigDecimal totalAmount,
    @JsonProperty("by_category") List<CategoryTotal> byCategory
) {
    public record CategoryTotal(
        Category category,
        long count,
        @JsonProperty("total_amount") BigDecimal totalAmount
    ) {}
}
