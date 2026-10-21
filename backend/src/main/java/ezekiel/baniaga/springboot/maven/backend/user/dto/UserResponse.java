package ezekiel.baniaga.springboot.maven.backend.user.dto;

import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Public view of a user. id is the unique_id, never the database id,
 * and the password hash is never included. displayName is null when unset.
 */
public record UserResponse(
    UUID id,
    String username,
    String displayName,
    Role role,
    LocalDateTime createdAt
){}
