package ezekiel.baniaga.springboot.maven.backend.common;

import lombok.Getter;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Getter
public class ErrorResponse {
    private String code;
    private String[] messages;
    private LocalDateTime timestamp;

    public ErrorResponse(String code, String message) {
        this(code, new String[]{ message });
    }

    public ErrorResponse(String code, String[] messages) {
        this.code = code;
        this.messages = messages;
        // UTC like every other timestamp; not a bean, so no injected Clock
        this.timestamp = LocalDateTime.now(ZoneOffset.UTC);
    }
}
