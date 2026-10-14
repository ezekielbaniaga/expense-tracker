package ezekiel.baniaga.springboot.maven.backend.user.dto;

import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Public view of a user. id is the unique_id, never the database id,
 * and the password hash is never included.
 */
public record UserResponse(
    UUID id,
    String username,
    Role role,
    LocalDateTime createdAt
){}
