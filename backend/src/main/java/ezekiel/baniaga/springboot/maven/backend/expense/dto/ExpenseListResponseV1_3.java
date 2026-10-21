package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.util.List;

// total and total_pages cover every row that matches, not only this page
public record ExpenseListResponseV1_3 (
    List<ExpenseListItemResponseV1_2> expenses,
    int page,
    int size,
    long total,
    @JsonProperty("total_pages") int totalPages,
    @JsonProperty("total_amount") BigDecimal totalAmount
){}
