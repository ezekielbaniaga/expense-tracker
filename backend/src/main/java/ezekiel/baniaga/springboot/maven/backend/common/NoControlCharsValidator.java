package ezekiel.baniaga.springboot.maven.backend.common;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class NoControlCharsValidator implements ConstraintValidator<NoControlChars, CharSequence> {

    @Override
    public boolean isValid(CharSequence value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }
        return value.chars().noneMatch(c ->
            (c < 0x20 && c != '\t' && c != '\n' && c != '\r') || c == 0x7F)
            && !Surrogates.hasUnpaired(value);
    }
}
