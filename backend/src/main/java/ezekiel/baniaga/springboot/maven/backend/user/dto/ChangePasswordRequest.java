package ezekiel.baniaga.springboot.maven.backend.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(

    // Only a cap against huge bodies, like LoginRequest.password: not a password rule
    @NotBlank
    @Size(max = 1000)
    String currentPassword,

    // Length and content rules live in PasswordValidator
    @NotBlank
    String newPassword
){}
