package ezekiel.baniaga.springboot.maven.backend.auth.service;

import ezekiel.baniaga.springboot.maven.backend.auth.props.AdminBootstrapProperties;
import ezekiel.baniaga.springboot.maven.backend.config.DefaultUUIDGenerator;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminBootstrapService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AdminBootstrapProperties adminBootstrapProperties;
    private final DefaultUUIDGenerator uuidGenerator;

    // BCrypt only hashes the first 72 bytes; BCryptPasswordEncoder rejects longer input
    private static final int MAX_PASSWORD_BYTES = 72;

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

        if (userRepository.findByUsername(adminBootstrapProperties.getUsername()).isPresent()) {
            return;
        }

        User admin = new User();
        admin.setUniqueId(uuidGenerator.generate());
        admin.setUsername(adminBootstrapProperties.getUsername());
        admin.setPassword(passwordEncoder.encode(adminBootstrapProperties.getPassword()));
        admin.setRole(Role.ADMIN);
        admin.setEnabled(true);
        admin.setCreatedAt(LocalDateTime.now());

        userRepository.save(admin);

        log.info("Default Admin User Created");
    }
}
