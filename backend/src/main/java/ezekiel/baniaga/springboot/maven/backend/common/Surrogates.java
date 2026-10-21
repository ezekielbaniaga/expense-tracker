package ezekiel.baniaga.springboot.maven.backend.common;

/**
 * PostgreSQL can't store an unpaired UTF-16 surrogate: the driver writes it as
 * "?", so the row would differ from the text the write response echoed.
 */
public final class Surrogates {

    private Surrogates() {
    }

    /** True when the text has a high surrogate without a following low one, or a lone low surrogate. */
    public static boolean hasUnpaired(CharSequence text) {
        int length = text.length();
        for (int i = 0; i < length; i++) {
            char c = text.charAt(i);
            if (Character.isHighSurrogate(c)) {
                if (i + 1 < length && Character.isLowSurrogate(text.charAt(i + 1))) {
                    i++;
                } else {
                    return true;
                }
            } else if (Character.isLowSurrogate(c)) {
                return true;
            }
        }
        return false;
    }
}
