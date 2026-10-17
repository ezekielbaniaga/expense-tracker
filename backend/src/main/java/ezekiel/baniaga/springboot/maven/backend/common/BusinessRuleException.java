package ezekiel.baniaga.springboot.maven.backend.common;

/**
 * Exception Class for creating business rule exceptions that will be
 * returned to the API consumer. The request could be valid but
 * conflicts with the current data.
 *
 * Duplicate / concurrent update / invalid state
 *
 * Example 1:
 *  {
 *      "code": "INSUFFICIENT_BALANCE",
 *      "message": "Not enough funds"
 *  }
 *
 * Example 2:
 *  {
 *      "code": "MODIFY_ARCHIVED",
 *      "message": "Cannot modify archived expense"
 *  }
 *
 * Example 3:
 *  {
 *      "code": "DUPLICATE_MRN",
 *      "message": "The MRN already exists"
 *  }
 */
public class BusinessRuleException extends RuntimeException {

    private final String code;

    public BusinessRuleException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
