package ezekiel.baniaga.springboot.maven.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(

    // users.username is VARCHAR(100)
    @NotBlank
    @Size(max = 100)
    String username,

    // Only a cap against huge bodies, not a password rule: accounts created before
    // PasswordValidator may have longer passwords, so this must not hint at its 72-byte limit
    @NotBlank
    @Size(max = 1000)
    String password
){}
