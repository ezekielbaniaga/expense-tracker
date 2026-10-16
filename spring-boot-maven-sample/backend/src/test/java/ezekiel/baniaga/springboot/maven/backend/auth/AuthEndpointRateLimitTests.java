package ezekiel.baniaga.springboot.maven.backend.auth;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Per client IP limits on /auth/register, /auth/refresh and /auth/logout, at the production
 * values (the test profile raises them). Each test uses its own random IP, since the buckets
 * live as long as the Spring context.
 */
@SpringBootTest(properties = {
    "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long",
    "app.rate-limit.register.client-ip.capacity=10",
    "app.rate-limit.register.client-ip.period=1h",
    "app.rate-limit.refresh.client-ip.capacity=60",
    "app.rate-limit.refresh.client-ip.period=1m",
    "app.rate-limit.logout.client-ip.capacity=60",
    "app.rate-limit.logout.client-ip.period=1m"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AuthEndpointRateLimitTests {

    // 43 characters like a real refresh token, but matching no session
    private static final String UNKNOWN_REFRESH_TOKEN = "x".repeat(43);

    @Autowired MockMvc mockMvc;

    @Test
    void eleventhRegisterFromOneIpIs429() throws Exception {
        String ip = randomIp();

        for (int i = 0; i < 10; i++) {
            register(newUsername(), ip).andExpect(status().isCreated());
        }

        expect429(register(newUsername(), ip));

        // Another address is unaffected
        register(newUsername(), randomIp()).andExpect(status().isCreated());
    }

    @Test
    void sixtyFirstRefreshFromOneIpIs429() throws Exception {
        String ip = randomIp();

        // Every attempt counts, also failed ones, so unknown tokens can't be tried endlessly
        for (int i = 0; i < 60; i++) {
            withToken("/auth/refresh", UNKNOWN_REFRESH_TOKEN, ip).andExpect(status().isUnauthorized());
        }

        expect429(withToken("/auth/refresh", UNKNOWN_REFRESH_TOKEN, ip));

        withToken("/auth/refresh", UNKNOWN_REFRESH_TOKEN, randomIp()).andExpect(status().isUnauthorized());
    }

    @Test
    void sixtyFirstLogoutFromOneIpIs429() throws Exception {
        String ip = randomIp();

        for (int i = 0; i < 60; i++) {
            withToken("/auth/logout", UNKNOWN_REFRESH_TOKEN, ip).andExpect(status().isNoContent());
        }

        expect429(withToken("/auth/logout", UNKNOWN_REFRESH_TOKEN, ip));

        withToken("/auth/logout", UNKNOWN_REFRESH_TOKEN, randomIp()).andExpect(status().isNoContent());
    }

    @Test
    void endpointsHaveSeparateBuckets() throws Exception {
        String ip = randomIp();

        for (int i = 0; i < 60; i++) {
            withToken("/auth/logout", UNKNOWN_REFRESH_TOKEN, ip).andExpect(status().isNoContent());
        }
        withToken("/auth/logout", UNKNOWN_REFRESH_TOKEN, ip).andExpect(status().isTooManyRequests());

        // A client that logged out a lot can still refresh and register
        withToken("/auth/refresh", UNKNOWN_REFRESH_TOKEN, ip).andExpect(status().isUnauthorized());
        register(newUsername(), ip).andExpect(status().isCreated());
    }

    private static void expect429(ResultActions result) throws Exception {
        String retryAfter = result
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"))
            .andExpect(jsonPath("$.messages[0]").isNotEmpty())
            .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
            .andReturn().getResponse().getHeader(HttpHeaders.RETRY_AFTER);
        assertThat(Long.parseLong(retryAfter)).isPositive();
    }

    private ResultActions register(String username, String clientIp) throws Exception {
        return mockMvc.perform(post("/auth/register")
            .with(request -> {
                request.setRemoteAddr(clientIp);
                return request;
            })
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"correct-horse-battery\"}"));
    }

    private ResultActions withToken(String path, String refreshToken, String clientIp) throws Exception {
        return mockMvc.perform(
            post(path)
                .with(request -> {
                    request.setRemoteAddr(clientIp);
                    return request;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + refreshToken + "\"}"));
    }

    private static String newUsername() {
        return "reg-" + UUID.randomUUID();
    }

    private static String randomIp() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        return "10." + random.nextInt(256) + "." + random.nextInt(256) + "." + random.nextInt(1, 255);
    }
}
