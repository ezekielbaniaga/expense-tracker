package ezekiel.baniaga.springboot.maven.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RefreshTokenRequest (
    // Issued tokens are 43 characters; the cap leaves room without accepting huge bodies
    @NotBlank @Size(max = 128) String refreshToken
) {
}
