package ezekiel.baniaga.springboot.maven.backend.session;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.Base64;

@Component
public class RefreshTokenGenerator {

    private final SecureRandom secureRandom = new SecureRandom();


    /**
     * This generates a token similar to:
     * <code>dG9rZW4tZXhhbXBsZS1sb25nLXJhbmRvbS1ieXRlcw</code>
     *
     * The important properties are:
     *
     *   ✓ Cryptographically secure
     *   ✓ Random
     *   ✓ URL-safe
     *   ✓ 256 bits of entropy
     */
    public String generate() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);

        return Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(bytes);
    }
}
