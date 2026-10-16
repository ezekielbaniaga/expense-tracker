package ezekiel.baniaga.springboot.maven.backend.auth.service;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import ezekiel.baniaga.springboot.maven.backend.auth.props.AdminBootstrapProperties;
import ezekiel.baniaga.springboot.maven.backend.config.DefaultUUIDGenerator;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import ezekiel.baniaga.springboot.maven.backend.user.PasswordChangeRateLimiter;
import ezekiel.baniaga.springboot.maven.backend.user.PasswordValidator;
import ezekiel.baniaga.springboot.maven.backend.user.UsernameValidator;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// Plain unit test: no Spring context needed (the test profile skips the bootstrap runner)
class AdminBootstrapServiceTests {

    private static final String PASSWORD = "correct-horse-battery";

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    private final Logger logger = (Logger) LoggerFactory.getLogger(AdminBootstrapService.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    @BeforeEach
    void attachLogAppender() {
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void detachLogAppender() {
        logger.detachAppender(logs);
    }

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

    // The value .env.example ships with: a copied .env would otherwise start with a password from the repo
    @ParameterizedTest
    @ValueSource(strings = {"change-me", "CHANGE-ME", " change-me "})
    void envExamplePlaceholderIsRejected(String password) {
        assertThatThrownBy(() -> create(password))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ADMIN_PASSWORD")
            .hasMessageContaining("placeholder");
        verify(userRepository, never()).save(any());
    }

    // Also when the admin already exists: the placeholder is never a deliberate choice
    @Test
    void envExamplePlaceholderIsRejectedEvenIfTheAdminExists() {
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(existing(Role.ADMIN, true)));

        assertThatThrownBy(() -> create("change-me"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ADMIN_PASSWORD");
    }

    @Test
    void shortPasswordIsRejectedWhenTheAdminWouldBeCreated() {
        when(userRepository.findByUsername("admin")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> create("a".repeat(11)))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ADMIN_PASSWORD must be at least 12 characters");
        verify(userRepository, never()).save(any());
    }

    @Test
    void passwordOfExactly12CharactersCreatesTheAdmin() {
        create("a".repeat(12));

        verify(userRepository).save(any());
    }

    // ADMIN_PASSWORD is only used to create the admin, so a setup from before the minimum still starts
    @Test
    void shortPasswordIsAcceptedWhenTheAdminAlreadyExists() {
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(existing(Role.ADMIN, true)));

        create("devpassword");

        verify(userRepository, never()).save(any());
        assertThat(warnings()).isEmpty();
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
        create(username, PASSWORD);

        verify(userRepository).findByUsername("admin");
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("admin");
    }

    @Test
    void nonBlankUsernameIsUsedAsGiven() {
        create("alice", PASSWORD);

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("alice");
    }

    @Test
    void existingEnabledAdminIsLeftAloneWithoutWarning() {
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(existing(Role.ADMIN, true)));

        create(PASSWORD);

        verify(userRepository, never()).save(any());
        assertThat(warnings()).isEmpty();
    }

    // ADMIN_USERNAME pointed at a name a USER registered: no admin exists and ADMIN_PASSWORD does not work
    @Test
    void existingUserWithTheAdminNameIsNotPromotedButWarned() {
        User user = existing(Role.USER, true);
        when(userRepository.findByUsername("alice")).thenReturn(Optional.of(user));

        create("alice", PASSWORD);

        verify(userRepository, never()).save(any());
        assertThat(user.getRole()).isEqualTo(Role.USER);
        assertThat(warnings()).singleElement().asString()
            .contains("'alice'", "role USER", "not an ADMIN");
    }

    @Test
    void existingDisabledAdminIsNotEnabledButWarned() {
        User admin = existing(Role.ADMIN, false);
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(admin));

        create(PASSWORD);

        verify(userRepository, never()).save(any());
        assertThat(admin.isEnabled()).isFalse();
        assertThat(warnings()).singleElement().asString()
            .contains("'admin'", "disabled");
    }

    @Test
    void noExistingUserCreatesTheAdminWithoutWarning() {
        when(userRepository.findByUsername("admin")).thenReturn(Optional.empty());

        create(PASSWORD);

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("admin");
        assertThat(saved.getValue().getRole()).isEqualTo(Role.ADMIN);
        assertThat(warnings()).isEmpty();
    }

    private static User existing(Role role, boolean enabled) {
        User user = new User();
        user.setRole(role);
        user.setEnabled(enabled);
        return user;
    }

    private List<String> warnings() {
        return logs.list.stream()
            .filter(event -> event.getLevel() == Level.WARN)
            .map(ILoggingEvent::getFormattedMessage)
            .toList();
    }

    private void create(String password) {
        create("admin", password);
    }

    private void create(String username, String password) {
        AdminBootstrapProperties properties = new AdminBootstrapProperties();
        properties.setUsername(username);
        properties.setPassword(password);

        UserService userService = new UserService(
            userRepository, passwordEncoder, new DefaultUUIDGenerator(), new PasswordValidator(), new UsernameValidator(),
            mock(UserSessionService.class), mock(PasswordChangeRateLimiter.class), Clock.systemUTC());
        new AdminBootstrapService(userRepository, userService, properties)
            .createInitialAdminUser();
    }
}
