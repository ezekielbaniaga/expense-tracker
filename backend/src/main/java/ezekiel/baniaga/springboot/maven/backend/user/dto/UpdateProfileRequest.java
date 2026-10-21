package ezekiel.baniaga.springboot.maven.backend.user.dto;

/**
 * Body of PATCH /users/me. An empty (or blank) displayName clears it;
 * the rules live in DisplayNameValidator.
 */
public record UpdateProfileRequest(
    String displayName
){}
