package ezekiel.baniaga.springboot.maven.backend.common;

/**
 * Exception class for handling bad request
 * e.g. Category = "billsss" which should be "bills"
 */
public class BadRequestException extends RuntimeException {

    private final String code;

    public BadRequestException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
