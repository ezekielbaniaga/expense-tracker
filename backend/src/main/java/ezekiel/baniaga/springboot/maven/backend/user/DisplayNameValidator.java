package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.common.BadRequestException;
import ezekiel.baniaga.springboot.maven.backend.common.Surrogates;
import org.springframework.stereotype.Component;

/**
 * Rules for the optional display name. It is free text (any script, spaces
 * inside), but control characters such as newlines, invisible format
 * characters (zero-width, bidi overrides, BOM), line/paragraph separators and
 * unpaired surrogates and names with nothing visible in them are refused, so the name can't split log
 * lines, break the UI layout, reorder surrounding text or look blank.
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
        // Checked before strip(), which would silently drop U+2028/U+2029 and turn them into "clear the name"
        if (Surrogates.hasUnpaired(displayName)
            || displayName.codePoints().anyMatch(DisplayNameValidator::isInvisibleFormatting)) {
            throw invalid();
        }
        String normalized = displayName.strip();
        if (normalized.isEmpty()) {
            return null;
        }
        if (normalized.codePointCount(0, normalized.length()) > MAX_LENGTH
            || normalized.codePoints().anyMatch(Character::isISOControl)
            || normalized.codePoints().noneMatch(DisplayNameValidator::isVisible)) {
            throw invalid();
        }
        return normalized;
    }

    private static boolean isInvisibleFormatting(int codePoint) {
        int type = Character.getType(codePoint);
        return type == Character.FORMAT
            || type == Character.LINE_SEPARATOR
            || type == Character.PARAGRAPH_SEPARATOR;
    }

    // strip() keeps no-break spaces (U+00A0, U+2007, U+202F), so they are checked here
    private static boolean isVisible(int codePoint) {
        return !Character.isWhitespace(codePoint) && Character.getType(codePoint) != Character.SPACE_SEPARATOR;
    }

    private static BadRequestException invalid() {
        return new BadRequestException("INVALID_DISPLAY_NAME",
            "Display name must be 1-" + MAX_LENGTH + " characters without control or invisible characters, or empty to clear it.");
    }
}
