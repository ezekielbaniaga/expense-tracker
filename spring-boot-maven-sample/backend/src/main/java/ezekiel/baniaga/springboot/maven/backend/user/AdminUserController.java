package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.user.dto.AdminUserResponse;
import ezekiel.baniaga.springboot.maven.backend.user.dto.UpdateUserRequest;
import ezekiel.baniaga.springboot.maven.backend.user.dto.UserListResponse;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import ezekiel.baniaga.springboot.maven.backend.user.mapper.UserMapper;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Admin user management. SecurityConfig already limits /users/** to ADMIN;
 * @PreAuthorize repeats it per method so a future URL rule change can't
 * open these up. {id} is always the unique_id, never the database id.
 */
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class AdminUserController {

    private final UserService userService;
    private final UserMapper userMapper;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public UserListResponse list(
        @RequestParam(required = false) String username,
        @RequestParam(required = false) Boolean enabled,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {

        Page<User> users = userService.listUsers(username, enabled, page, size);
        return new UserListResponse(
            users.getContent().stream().map(userMapper::toAdminResponse).toList(),
            users.getNumber(),
            users.getSize(),
            users.getTotalElements(),
            users.getTotalPages());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminUserResponse get(@PathVariable UUID id) {
        return userMapper.toAdminResponse(userService.getByUniqueId(id));
    }

    /**
     * 409 CONCURRENT_MODIFICATION on a stale version, CANNOT_MODIFY_SELF or
     * LAST_ADMIN for the guard rails. A role change applies at the user's
     * next login: disabling or demoting revokes all their sessions.
     */
    @PatchMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminUserResponse update(
        @PathVariable UUID id,
        @Valid @RequestBody UpdateUserRequest request,
        @AuthenticationPrincipal CustomUserDetails admin) {

        return userMapper.toAdminResponse(userService.updateUser(
            admin.getUniqueId(), id, request.version(), request.enabled(), request.role()));
    }
}
