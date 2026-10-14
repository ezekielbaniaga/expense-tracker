package ezekiel.baniaga.springboot.maven.backend.auth.service;

import ezekiel.baniaga.springboot.maven.backend.auth.props.AdminBootstrapProperties;
import ezekiel.baniaga.springboot.maven.backend.config.DefaultUUIDGenerator;
import ezekiel.baniaga.springboot.maven.backend.user.PasswordValidator;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

// Plain unit test: no Spring context needed (the test profile skips the bootstrap runner)
class AdminBootstrapServiceTests {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Test
    void blankPasswordIsRejected() {
        assertThatThrownBy(() -> create(""))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ADMIN_PASSWORD environment variable is required");
    }

    @Test
    void passwordLongerThan72BytesIsRejectedAtStartup() {
        assertThatThrownBy(() -> create("a".repeat(73)))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ADMIN_PASSWORD must be at most 72 bytes (got 73)");
    }

    @Test
    void lengthIsCountedInUtf8BytesNotChars() {
        // 37 chars, but each "é" is 2 bytes in UTF-8: 74 bytes
        assertThatThrownBy(() -> create("é".repeat(37)))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ADMIN_PASSWORD must be at most 72 bytes (got 74)");
    }

    @Test
    void passwordOfExactly72BytesCreatesTheAdmin() {
        String password = "a".repeat(72);

        create(password);

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(passwordEncoder.matches(password, saved.getValue().getPassword())).isTrue();
        assertThat(saved.getValue().getRole()).isEqualTo(Role.ADMIN);
        assertThat(saved.getValue().isEnabled()).isTrue();
        assertThat(saved.getValue().getUniqueId()).isNotNull();
        assertThat(saved.getValue().getCreatedAt()).isNotNull();
    }

    // Compose passes an empty ADMIN_USERNAME when .env doesn't set it, and Spring's
    // ${ADMIN_USERNAME:admin} default doesn't apply to an empty value
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\t"})
    void blankUsernameFallsBackToAdmin(String username) {
        create(username, "change-me");

        verify(userRepository).findByUsername("admin");
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("admin");
    }

    @Test
    void nonBlankUsernameIsUsedAsGiven() {
        create("alice", "change-me");

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("alice");
    }

    private void create(String password) {
        create("admin", password);
    }

    private void create(String username, String password) {
        AdminBootstrapProperties properties = new AdminBootstrapProperties();
        properties.setUsername(username);
        properties.setPassword(password);

        UserService userService = new UserService(
            userRepository, passwordEncoder, new DefaultUUIDGenerator(), new PasswordValidator());
        new AdminBootstrapService(userRepository, userService, properties)
            .createInitialAdminUser();
    }
}
