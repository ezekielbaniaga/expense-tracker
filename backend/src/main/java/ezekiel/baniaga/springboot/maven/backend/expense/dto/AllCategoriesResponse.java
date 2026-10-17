package ezekiel.baniaga.springboot.maven.backend.expense.dto;

import ezekiel.baniaga.springboot.maven.backend.expense.entity.Category;

public record AllCategoriesResponse(
    Category[] supported_categories
) {}
