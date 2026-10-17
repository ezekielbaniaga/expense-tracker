package ezekiel.baniaga.springboot.maven.backend.auth.props;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.ArrayList;
import java.util.List;

/**
 * The refresh token cookie a browser client opts into with
 * X-Refresh-Token-Transport: cookie on login. It is HttpOnly, SameSite=Strict
 * and scoped to /auth, so scripts can't read it and it goes only to the auth
 * endpoints.
 */
@ConfigurationProperties(prefix = "app.auth.refresh-cookie")
@Validated
@Getter @Setter
public class RefreshCookieProperties {

    /** The cookie's name. */
    @NotBlank
    private String name = "refresh_token";

    /**
     * Whether the cookie is marked Secure (sent over HTTPS only). Browsers
     * still accept a Secure cookie from http://localhost.
     */
    private boolean secure = true;

    /**
     * Origins (scheme://host[:port]) the browser UI is served from, allowed to
     * use the cookie on refresh and logout.
     */
    @NotNull
    private List<String> allowedOrigins = new ArrayList<>(
        List.of("http://localhost:5173", "http://localhost:8081"));

}
