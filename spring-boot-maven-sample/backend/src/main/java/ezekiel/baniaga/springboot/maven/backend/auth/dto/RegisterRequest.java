package ezekiel.baniaga.springboot.maven.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(

    // users.username is VARCHAR(100)
    @NotBlank
    @Size(max = 100)
    String username,

    // Length and content rules live in PasswordValidator
    @NotBlank
    String password
){}
