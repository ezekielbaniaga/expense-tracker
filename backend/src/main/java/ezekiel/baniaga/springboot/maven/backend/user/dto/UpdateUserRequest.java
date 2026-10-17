package ezekiel.baniaga.springboot.maven.backend.user.dto;

import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Admin PATCH. version is required like on expenses; enabled and role are
 * each optional (null leaves them as they are), but at least one is needed.
 */
public record UpdateUserRequest(

    @NotNull
    @PositiveOrZero
    Long version,

    Boolean enabled,

    Role role
){}
