package ezekiel.baniaga.springboot.maven.backend.expense;

import ezekiel.baniaga.springboot.maven.backend.TestcontainersConfiguration;
import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * @PastOrPresent on the expense date follows the app Clock, offset to UTC+14 so that "present" is
 * today anywhere on Earth. At 2031-03-30T12:00Z it is already 2031-03-31 in UTC+14, whatever the
 * JVM zone is. Own Spring context, because the clock is replaced.
 */
@SpringBootTest(properties = "app.jwt.secret=test-secret-that-is-at-least-32-bytes-long")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, ExpenseDateClockTests.FixedClockConfig.class})
class ExpenseDateClockTests {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired JWTService jwtService;
    @Autowired CustomUserDetailsMapper mapper;

    private String token;
    private String existingId;

    @BeforeEach
    void setUp() throws Exception {
        User user = new User();
        user.setUniqueId(UUID.randomUUID());
        user.setUsername("user-" + UUID.randomUUID());
        user.setPassword("not-used");
        user.setRole(Role.USER);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());
        user = userRepository.save(user);
        token = "Bearer " + jwtService.generateToken(mapper.toCustomUserDetails(user));

        String body = mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json("2031-03-30")))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        existingId = com.jayway.jsonpath.JsonPath.read(body, "$.id").toString();
    }

    @Test
    void createAcceptsTodayInTheEarliestZoneAndRejectsTomorrowThere() throws Exception {
        mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(json("2031-03-31")))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/expense").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(json("2031-04-01")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void updateAcceptsTodayInTheEarliestZoneAndRejectsTomorrowThere() throws Exception {
        mockMvc.perform(put("/api/expense/" + existingId).header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(updateJson("2031-04-01")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        mockMvc.perform(put("/api/expense/" + existingId).header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(updateJson("2031-03-31")))
            .andExpect(status().isOk());
    }

    private static String updateJson(String date) {
        return "{\"version\":0,\"description\":\"clock\",\"amount\":5,\"category\":\"FOOD\",\"date\":\""
            + date + "\"}";
    }

    private static String json(String date) {
        return "{\"description\":\"clock\",\"amount\":5,\"category\":\"FOOD\",\"date\":\"" + date + "\"}";
    }

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(Instant.parse("2031-03-30T12:00:00Z"), ZoneOffset.UTC);
        }
    }
}
