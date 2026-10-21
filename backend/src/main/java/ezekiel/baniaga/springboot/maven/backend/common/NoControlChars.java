package ezekiel.baniaga.springboot.maven.backend.common;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Rejects control characters (NUL, other C0 controls, DEL) in free text. Tab,
 * newline and carriage return are allowed. NUL in particular is not storable
 * in PostgreSQL text columns and would otherwise surface as a 500. Null is valid.
 */
@Documented
@Constraint(validatedBy = NoControlCharsValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface NoControlChars {
    String message() default "must not contain control characters";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
