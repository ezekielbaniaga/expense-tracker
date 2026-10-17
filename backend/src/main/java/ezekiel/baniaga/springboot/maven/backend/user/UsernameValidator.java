package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.common.BadRequestException;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * Username rules for self sign-up. Without them, "alice ", a lone zero-width
 * space or a name containing a newline all registered as separate accounts:
 * lookalikes in the admin list and log lines split by newlines.
 *
 * Only registration enforces the character set. Login just strips the name
 * (see DatabaseUserDetailsService), so accounts created before these rules,
 * or by the ADMIN_USERNAME bootstrap, still log in with their exact name.
 */
@Component
public class UsernameValidator {

    // ASCII only, so names can't differ by invisible or lookalike characters
    private static final Pattern ALLOWED = Pattern.compile("[A-Za-z0-9._-]+");

    /** Strips leading and trailing whitespace (Unicode-aware, unlike trim()). */
    public static String normalize(String username) {
        return username == null ? null : username.strip();
    }

    /** Returns the stripped name, or throws 400 INVALID_USERNAME. */
    public String normalizeAndValidate(String username) {
        String normalized = normalize(username);
        if (normalized == null || !ALLOWED.matcher(normalized).matches()) {
            throw new BadRequestException("INVALID_USERNAME",
                "Username may only contain letters A-Z, digits, '.', '_' and '-'.");
        }
        return normalized;
    }
}
