package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.common.BadRequestException;
import org.springframework.stereotype.Component;

/**
 * Rules for the optional display name. It is free text (any script, spaces
 * inside), but control characters such as newlines are refused so the name
 * can't split log lines or break the UI layout.
 */
@Component
public class DisplayNameValidator {

    // Matches the VARCHAR(100) column, which counts characters, not bytes
    static final int MAX_LENGTH = 100;

    /**
     * Returns the stripped name, null when it is empty after stripping (clears
     * it), or throws 400 INVALID_DISPLAY_NAME.
     */
    public String normalizeAndValidate(String displayName) {
        if (displayName == null) {
            throw invalid();
        }
        String normalized = displayName.strip();
        if (normalized.isEmpty()) {
            return null;
        }
        if (normalized.codePointCount(0, normalized.length()) > MAX_LENGTH
            || normalized.codePoints().anyMatch(Character::isISOControl)) {
            throw invalid();
        }
        return normalized;
    }

    private static BadRequestException invalid() {
        return new BadRequestException("INVALID_DISPLAY_NAME",
            "Display name must be 1-" + MAX_LENGTH + " characters without control characters, or empty to clear it.");
    }
}
