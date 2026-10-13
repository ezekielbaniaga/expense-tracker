package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import jakarta.validation.constraints.*;

public record PatchExpenseDescriptionRequest (

    @NotNull
    @PositiveOrZero
    Long version,

    @NotBlank
    @Size(max=250)
    String description

){}
