package ezekiel.baniaga.springboot.maven.backend.common;

/**
 * Request refused for a reason the client can't fix by authenticating,
 * e.g. a refresh cookie sent from an origin that isn't allowed to use it.
 */
public class ForbiddenException extends RuntimeException {

    private final String code;

    public ForbiddenException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
