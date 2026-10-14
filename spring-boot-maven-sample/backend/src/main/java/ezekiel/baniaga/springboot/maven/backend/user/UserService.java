package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.common.BadRequestException;
import ezekiel.baniaga.springboot.maven.backend.common.BusinessRuleException;
import ezekiel.baniaga.springboot.maven.backend.common.ResourceNotFoundException;
import ezekiel.baniaga.springboot.maven.backend.config.DefaultUUIDGenerator;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import ezekiel.baniaga.springboot.maven.backend.user.entity.Role;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * The one place that creates users, so every caller (admin bootstrap,
 * registration) gets the same uniqueId, createdAt, enabled flag
 * and password hashing.
 */
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final DefaultUUIDGenerator uuidGenerator;
    private final PasswordValidator passwordValidator;
    private final UserSessionService userSessionService;

    /**
     * Looks a user up by the unique_id from the access token. 404 if the
     * account was removed after the token was issued.
     */
    @Transactional(readOnly = true)
    public User getByUniqueId(UUID uniqueId) {
        return userRepository.findByUniqueId(uniqueId)
            .orElseThrow(() -> new ResourceNotFoundException("USER_NOT_FOUND", "User not found."));
    }

    /**
     * Changes the password after checking the current one, then revokes all
     * of the user's sessions so a stolen refresh token stops working. The
     * caller's own session goes too; the client logs in with the new password.
     *
     * A wrong current password is 400, not 401, so clients don't mistake it
     * for an expired login.
     */
    @Transactional
    public void changePassword(UUID uniqueId, String currentPassword, String newPassword) {
        User user = getByUniqueId(uniqueId);

        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new BadRequestException("INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
        }
        passwordValidator.validate(user.getUsername(), newPassword);

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setLastModified(LocalDateTime.now());
        userRepository.save(user);

        userSessionService.revokeAllForUser(user.getId());
    }

    /**
     * Self sign-up: always a USER. Usernames are unique ignoring case (V11),
     * so "alice" is taken once "Alice" exists.
     */
    @Transactional
    public User register(String username, String rawPassword) {
        passwordValidator.validate(username, rawPassword);

        if (userRepository.findByUsername(username).isPresent()) {
            throw usernameTaken();
        }

        try {
            return createUser(username, rawPassword, Role.USER);
        } catch (DataIntegrityViolationException e) {
            // Two registrations for the same name both passed the check above;
            // the unique index lets one in and rejects the other here
            throw usernameTaken();
        }
    }

    /**
     * Creates a user without applying the password rules. Callers validate
     * their own input first (the admin bootstrap has its own checks).
     */
    @Transactional
    public User createUser(String username, String rawPassword, Role role) {
        User user = new User();
        user.setUniqueId(uuidGenerator.generate());
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(rawPassword));
        user.setRole(role);
        user.setEnabled(true);
        user.setCreatedAt(LocalDateTime.now());

        return userRepository.save(user);
    }

    private static BusinessRuleException usernameTaken() {
        return new BusinessRuleException("USERNAME_TAKEN", "Username is already taken.");
    }
}
