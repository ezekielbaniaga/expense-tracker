package ezekiel.baniaga.springboot.maven.backend.auth;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as LoginTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class AuthRequestSizeLimitTests {

    @Autowired MockMvc mockMvc;

    @Test
    void oversizeLoginUsernameIsAValidationError() throws Exception {
        login("u".repeat(101), "some-password")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.messages", hasItem(containsString("username"))));
    }

    @Test
    void loginUsernameAtTheLimitIsCheckedNormally() throws Exception {
        login("u".repeat(100), "some-password").andExpect(status().isUnauthorized());
    }

    @Test
    void oversizeLoginPasswordIsAValidationError() throws Exception {
        login("someone", "p".repeat(1001))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.messages", hasItem(containsString("password"))))
            // Old passwords may predate the 72-byte rule, so login must not hint at it
            .andExpect(jsonPath("$.messages[0]", not(containsString("72"))));
    }

    @Test
    void loginPasswordOver72BytesButUnderTheCapIsCheckedNormally() throws Exception {
        login("someone", "p".repeat(1000)).andExpect(status().isUnauthorized());
    }

    @Test
    void oversizeRefreshTokenIsAValidationError() throws Exception {
        postToken("/auth/refresh", "r".repeat(129))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.messages", hasItem(containsString("refreshToken"))));
    }

    @Test
    void refreshTokenAtTheLimitIsCheckedNormally() throws Exception {
        postToken("/auth/refresh", "r".repeat(128)).andExpect(status().isUnauthorized());
    }

    @Test
    void oversizeLogoutTokenIsAValidationError() throws Exception {
        postToken("/auth/logout", "r".repeat(129))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private ResultActions login(String username, String password) throws Exception {
        return mockMvc.perform(post("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"));
    }

    private ResultActions postToken(String path, String refreshToken) throws Exception {
        return mockMvc.perform(post(path)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"refreshToken\":\"" + refreshToken + "\"}"));
    }
}
