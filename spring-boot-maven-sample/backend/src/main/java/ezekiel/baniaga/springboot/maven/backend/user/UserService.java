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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import jakarta.persistence.criteria.Predicate;

/**
 * The one place that creates users, so every caller (admin bootstrap,
 * registration) gets the same uniqueId, createdAt, enabled flag
 * and password hashing. Also holds the admin list/update rules.
 */
@Service
@RequiredArgsConstructor
public class UserService {

    static final int MAX_PAGE_SIZE = 100;

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

    /**
     * Admin list, oldest first. username is a case-insensitive substring
     * match (LIKE wildcards in it are literal); enabled filters exactly.
     * Either filter may be null.
     */
    @Transactional(readOnly = true)
    public Page<User> listUsers(String username, Boolean enabled, int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException("INVALID_PAGE",
                "page must be 0 or more and size between 1 and " + MAX_PAGE_SIZE + ".");
        }

        Specification<User> filters = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (username != null && !username.isBlank()) {
                String pattern = "%" + escapeLike(username.toLowerCase()) + "%";
                predicates.add(cb.like(cb.lower(root.get("username")), pattern, '\\'));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        // id breaks ties so rows created in the same instant keep a stable order across pages
        Sort sort = Sort.by("createdAt").ascending().and(Sort.by("id").ascending());
        return userRepository.findAll(filters, PageRequest.of(page, size, sort));
    }

    /**
     * Admin change of enabled and/or role, checked against version like
     * expenses. Disabling or demoting revokes every session of the user, so
     * the next refresh fails and the next login carries the new state.
     *
     * Guard rails (409): an admin can't disable or demote themselves, and the
     * last enabled admin can't be disabled or demoted. The enabled admins are
     * locked before anything is read, so two admins demoting each other at
     * the same time are serialized and the second one sees only one admin left.
     */
    @Transactional
    public User updateUser(UUID actorId, UUID targetId, Long version, Boolean enabled, Role role) {
        if (enabled == null && role == null) {
            throw new BadRequestException("EMPTY_PATCH", "Nothing to change: give enabled and/or role.");
        }

        List<User> enabledAdmins = userRepository.lockEnabledAdmins();

        User user = getByUniqueId(targetId);
        if (!user.getVersion().equals(version)) {
            throw new BusinessRuleException("CONCURRENT_MODIFICATION", "User was modified by another user");
        }

        boolean disabling = Boolean.FALSE.equals(enabled) && user.isEnabled();
        boolean demoting = role == Role.USER && user.getRole() == Role.ADMIN;

        if ((disabling || demoting) && user.getUniqueId().equals(actorId)) {
            throw new BusinessRuleException("CANNOT_MODIFY_SELF", "You cannot disable or demote yourself.");
        }
        boolean removesEnabledAdmin = user.getRole() == Role.ADMIN && user.isEnabled() && (disabling || demoting);
        if (removesEnabledAdmin && enabledAdmins.size() <= 1) {
            throw new BusinessRuleException("LAST_ADMIN", "The last enabled admin cannot be disabled or demoted.");
        }

        if (enabled != null) {
            user.setEnabled(enabled);
        }
        if (role != null) {
            user.setRole(role);
        }
        user.setLastModified(LocalDateTime.now());

        // saveAndFlush so the response carries the incremented version
        User saved = userRepository.saveAndFlush(user);

        if (disabling || demoting) {
            userSessionService.revokeAllForUser(saved.getId());
        }
        return saved;
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
