package ezekiel.baniaga.springboot.maven.backend.auth;

import com.jayway.jsonpath.JsonPath;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Registers, logs in with an X-Forwarded-For header over a real connection
 * from 127.0.0.1, and returns the ip_address the new session lists.
 */
class ForwardedForClient {

    private static final String PASSWORD = "correct-horse-battery";

    private final HttpClient http = HttpClient.newHttpClient();
    private final int port;

    ForwardedForClient(int port) {
        this.port = port;
    }

    String loginAndReadSessionIp(String forwardedFor) throws Exception {
        String username = "proxy-" + UUID.randomUUID().toString().substring(0, 8);
        String credentials = "{\"username\":\"" + username + "\",\"password\":\"" + PASSWORD + "\"}";

        HttpResponse<String> register = send(json("/auth/register", credentials));
        assertThat(register.statusCode()).isEqualTo(201);

        HttpResponse<String> login = send(json("/auth/login", credentials)
            .header("X-Forwarded-For", forwardedFor));
        assertThat(login.statusCode()).isEqualTo(200);
        String accessToken = JsonPath.read(login.body(), "$.accessToken");

        HttpResponse<String> sessions = send(HttpRequest.newBuilder(uri("/users/me/sessions"))
            .header("Authorization", "Bearer " + accessToken)
            .GET());
        assertThat(sessions.statusCode()).isEqualTo(200);
        List<String> ips = JsonPath.read(sessions.body(), "$[*].ipAddress");
        assertThat(ips).hasSize(1);
        return ips.get(0);
    }

    private HttpRequest.Builder json(String path, String body) {
        return HttpRequest.newBuilder(uri(path))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body));
    }

    private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    // 127.0.0.1, not localhost, so the connection never comes from ::1
    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
