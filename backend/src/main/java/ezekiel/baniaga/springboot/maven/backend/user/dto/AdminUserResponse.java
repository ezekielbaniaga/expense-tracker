package ezekiel.baniaga.springboot.maven.backend.user.dto;

import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * What an admin sees of a user. Adds enabled, version (send it back on
 * PATCH) and lastModified to UserResponse. Never includes the password hash.
 */
public record AdminUserResponse(
    UUID id,
    String username,
    Role role,
    boolean enabled,
    Long version,
    LocalDateTime createdAt,
    LocalDateTime lastModified
){}
