package ezekiel.baniaga.springboot.maven.backend.auth;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs against a real server: MockMvc skips Tomcat's RemoteIpValve, so it
 * can't show which address a session records behind a proxy.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long",
        // Through the env var application.yml reads, so the wiring is tested too
        "TRUSTED_PROXIES=127[.]0[.]0[.]1"
    })
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ForwardedForTrustedProxyTests {

    @LocalServerPort int port;

    @Test
    void loginThroughTrustedProxyRecordsTheForwardedClientIp() throws Exception {
        ForwardedForClient client = new ForwardedForClient(port);

        String ipAddress = client.loginAndReadSessionIp("203.0.113.7");

        assertThat(ipAddress).isEqualTo("203.0.113.7");
    }
}
