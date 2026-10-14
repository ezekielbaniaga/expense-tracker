package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.common.BadRequestException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * Password rules for passwords users choose (registration, and password
 * change later). The ADMIN_PASSWORD bootstrap keeps its own looser check
 * so existing setups still start.
 */
@Component
public class PasswordValidator {

    static final int MIN_LENGTH = 12;

    // BCrypt only hashes the first 72 bytes; BCryptPasswordEncoder rejects longer input
    static final int MAX_BYTES = 72;

    public void validate(String username, String password) {
        if (password.length() < MIN_LENGTH) {
            throw invalid("Password must be at least " + MIN_LENGTH + " characters.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw invalid("Password must be at most " + MAX_BYTES + " bytes (UTF-8).");
        }
        // Usernames are case-insensitive, so "Alice" / "alice" is just as guessable
        if (password.equalsIgnoreCase(username)) {
            throw invalid("Password must not be the username.");
        }
    }

    private static BadRequestException invalid(String message) {
        return new BadRequestException("INVALID_PASSWORD", message);
    }
}
