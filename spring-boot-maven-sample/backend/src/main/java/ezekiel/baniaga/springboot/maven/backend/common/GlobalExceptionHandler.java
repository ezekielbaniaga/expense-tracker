package ezekiel.baniaga.springboot.maven.backend.common;

import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
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

}
