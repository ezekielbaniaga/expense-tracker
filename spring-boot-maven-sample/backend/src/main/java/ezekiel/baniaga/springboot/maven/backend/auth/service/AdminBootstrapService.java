package ezekiel.baniaga.springboot.maven.backend.auth.service;

import ezekiel.baniaga.springboot.maven.backend.auth.props.AdminBootstrapProperties;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminBootstrapService {

    private final UserRepository userRepository;
    private final UserService userService;
    private final AdminBootstrapProperties adminBootstrapProperties;

    // BCrypt only hashes the first 72 bytes; BCryptPasswordEncoder rejects longer input
    private static final int MAX_PASSWORD_BYTES = 72;

    // Spring's ${ADMIN_USERNAME:admin} default only covers an unset variable, not an empty one
    private static final String DEFAULT_USERNAME = "admin";

    public void createInitialAdminUser() {
        if (adminBootstrapProperties.getPassword().isBlank()) {
            throw new IllegalStateException(
                "ADMIN_PASSWORD environment variable is required."
            );
        }

        int bytes = adminBootstrapProperties.getPassword().getBytes(StandardCharsets.UTF_8).length;
        if (bytes > MAX_PASSWORD_BYTES) {
            throw new IllegalStateException(
                "ADMIN_PASSWORD must be at most " + MAX_PASSWORD_BYTES + " bytes (got " + bytes + ")."
            );
        }

        String username = adminBootstrapProperties.getUsername();
        if (username == null || username.isBlank()) {
            username = DEFAULT_USERNAME;
        }

        Optional<User> existing = userRepository.findByUsername(username);
        if (existing.isPresent()) {
            warnIfNotEnabledAdmin(username, existing.get());
            return;
        }

        userService.createUser(username, adminBootstrapProperties.getPassword(), Role.ADMIN);

        log.info("Default Admin User Created");
    }

    // The existing account is left as it is: promoting or re-enabling it at startup would let an
    // ADMIN_USERNAME change hand admin rights to whoever registered that name. Startup continues,
    // since other admins may exist, but ADMIN_PASSWORD is not applied to this account.
    private void warnIfNotEnabledAdmin(String username, User user) {
        if (user.getRole() != Role.ADMIN) {
            log.warn("ADMIN_USERNAME '{}' belongs to an existing account with role {}{}, which is not an ADMIN. "
                    + "No admin was created and ADMIN_PASSWORD does not apply to it. "
                    + "Choose another ADMIN_USERNAME or change the account's role.",
                username, user.getRole(), user.isEnabled() ? "" : " (disabled)");
        } else if (!user.isEnabled()) {
            log.warn("ADMIN_USERNAME '{}' belongs to an existing ADMIN account that is disabled. "
                    + "It was not re-enabled; enable it or choose another ADMIN_USERNAME.",
                username);
        }
    }
}
