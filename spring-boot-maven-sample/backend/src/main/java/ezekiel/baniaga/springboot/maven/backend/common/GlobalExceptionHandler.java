package ezekiel.baniaga.springboot.maven.backend.common;

import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.format.DateTimeParseException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * Conflicting with the current state of the resource.
     *
     * https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/409
     */
    @ExceptionHandler(BusinessRuleException.class)
    public ResponseEntity<?> handleBusinessRule(BusinessRuleException ex) {
        ErrorResponse resp = new ErrorResponse(ex.getCode(), ex.getMessage());
        return ResponseEntity.status(409).body(resp);
    }

    /**
     * Server cannot find the requested resource
     *
     * https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/404
     */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<?> handleNotFound(ResourceNotFoundException ex) {
        ErrorResponse resp = new ErrorResponse(ex.getCode(), ex.getMessage());
        return ResponseEntity.status(404).body(resp);
    }

    /**
     * Malformed error handled by Spring but wrapped here for clean return
     *
     * https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/400
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> handleValidation(MethodArgumentNotValidException ex) {
        String[] errors = ex.getBindingResult()
                .getFieldErrors()
                .stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .toList().toArray(new String[]{});

        ErrorResponse resp = new ErrorResponse("VALIDATION_ERROR", errors);
        return ResponseEntity.badRequest().body(resp);
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<?> handleBadRequest(BadRequestException ex) {
        ErrorResponse resp = new ErrorResponse(ex.getCode(), ex.getMessage());
        return ResponseEntity.status(400).body(resp);
    }

    /**
     * Invalid date such as JUNE 31 in JSON body
     */
    @ExceptionHandler(DateTimeParseException.class)
    public ResponseEntity<?> handleInvalidDate(DateTimeParseException ex) {
        ErrorResponse resp = new ErrorResponse("VALIDATION_ERROR", new String[] {
            ex.getMessage()
        });
        return ResponseEntity.badRequest().body(resp);
    }

    /**
     * Multiple update request by checking version
     */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<?> handleOptimisticLock(ObjectOptimisticLockingFailureException ex) {
        ErrorResponse resp = new ErrorResponse("CONCURRENT_MODIFICATION", "Record was modified by another user.");
        return ResponseEntity.status(409).body(resp);
    }

    /**
     * @PreAuthorize denials are thrown inside the controller, so they land here
     * rather than in SecurityConfig's access-denied handler. Same body as that one.
     *
     * https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/403
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<?> handleAccessDenied(AccessDeniedException ex) {
        ErrorResponse resp = new ErrorResponse("ACCESS_DENIED", "Access Denied");
        return ResponseEntity.status(403).body(resp);
    }

    /**
     * Path variable or query parameter of the wrong type, e.g. /users/not-a-uuid or ?page=abc.
     * Only the parameter name is returned, never the offending class or value.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<?> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        ErrorResponse resp = new ErrorResponse("VALIDATION_ERROR", ex.getName() + ": invalid value");
        return ResponseEntity.badRequest().body(resp);
    }

    /**
     * Unreadable request body: malformed JSON, unknown enum value, wrong field type.
     * Jackson's message names internal classes, so a fixed message is returned.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<?> handleUnreadableBody(HttpMessageNotReadableException ex) {
        ErrorResponse resp = new ErrorResponse("MALFORMED_REQUEST", "Request body is missing or malformed");
        return ResponseEntity.badRequest().body(resp);
    }

    /**
     * Required query parameter absent, e.g. DELETE /api/expense/{id} without ?version=.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<?> handleMissingParameter(MissingServletRequestParameterException ex) {
        ErrorResponse resp = new ErrorResponse("VALIDATION_ERROR", ex.getParameterName() + ": is required");
        return ResponseEntity.badRequest().body(resp);
    }
}
