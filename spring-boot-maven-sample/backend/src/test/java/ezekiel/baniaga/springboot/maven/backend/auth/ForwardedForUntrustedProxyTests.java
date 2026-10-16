package ezekiel.baniaga.springboot.maven.backend.auth;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The caller (127.0.0.1) is not the pinned proxy, so its X-Forwarded-For is
 * ignored: a client reaching the app directly can't spoof its address.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long",
        "TRUSTED_PROXIES=10[.]9[.]9[.]9"
    })
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ForwardedForUntrustedProxyTests {

    @LocalServerPort int port;

    @Test
    void forwardedForFromAnUntrustedAddressIsIgnored() throws Exception {
        ForwardedForClient client = new ForwardedForClient(port);

        String ipAddress = client.loginAndReadSessionIp("203.0.113.7");

        assertThat(ipAddress).isEqualTo("127.0.0.1");
    }
}
