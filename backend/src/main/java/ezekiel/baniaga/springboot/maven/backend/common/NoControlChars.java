package ezekiel.baniaga.springboot.maven.backend.common;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Rejects characters PostgreSQL can't store faithfully in free text: control
 * characters (NUL, other C0 controls, DEL; tab, newline and carriage return are
 * allowed) and unpaired UTF-16 surrogates. NUL would otherwise surface as a 500,
 * a lone surrogate would be stored as "?" while the response echoed the original.
 * Valid surrogate pairs (emoji) are fine. Null is valid.
 */
@Documented
@Constraint(validatedBy = NoControlCharsValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface NoControlChars {
    String message() default "must not contain control characters or unpaired surrogates";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
