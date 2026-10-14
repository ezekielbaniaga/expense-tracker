package ezekiel.baniaga.springboot.maven.backend.user.dto;

import jakarta.validation.constraints.NotBlank;

public record ChangePasswordRequest(

    @NotBlank
    String currentPassword,

    // Length and content rules live in PasswordValidator
    @NotBlank
    String newPassword
){}
