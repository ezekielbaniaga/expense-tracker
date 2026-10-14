package ezekiel.baniaga.springboot.maven.backend.expense;

import com.jayway.jsonpath.JsonPath;
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
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Same configuration as ExpenseOwnershipTests, so both share one Spring context and container
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ExpenseIsolationTests {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired MockMvc mockMvc;
    @Autowired JsonMapper jsonMapper;

    // Both users go through the real register + login flow, not hand-built tokens
    @Test
    void registeredUserCannotReachAnotherRegisteredUsersExpense() throws Exception {
        String alice = registerAndLogin("alice");
        String bob = registerAndLogin("bob");

        String body = mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, alice)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"description":"Lunch","amount":12.50,"category":"FOOD","date":"2026-10-01"}
                    """))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        mockMvc.perform(get("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, bob))
            .andExpect(status().isNotFound());

        mockMvc.perform(put("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, bob)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"version":0,"description":"Hijacked","amount":1,"category":"FOOD","date":"2026-10-01"}
                    """))
            .andExpect(status().isNotFound());

        mockMvc.perform(patch("/api/expense/" + id + "/description").header(HttpHeaders.AUTHORIZATION, bob)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":0,\"description\":\"Hijacked\"}"))
            .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/expense/" + id + "?version=0").header(HttpHeaders.AUTHORIZATION, bob))
            .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, bob))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.expenses", hasSize(0)));

        // Still intact and active for the owner
        mockMvc.perform(get("/api/expense/" + id).header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.description").value("Lunch"))
            .andExpect(jsonPath("$.version").value(0));
        mockMvc.perform(get("/api/expense").header(HttpHeaders.AUTHORIZATION, alice))
            .andExpect(jsonPath("$.expenses", hasSize(1)));
    }

    private String registerAndLogin(String prefix) throws Exception {
        String username = prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
        String credentials = jsonMapper.writeValueAsString(Map.of("username", username, "password", PASSWORD));

        mockMvc.perform(post("/auth/register").contentType(MediaType.APPLICATION_JSON).content(credentials))
            .andExpect(status().isCreated());

        String body = mockMvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content(credentials))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return "Bearer " + JsonPath.read(body, "$.accessToken");
    }
}
