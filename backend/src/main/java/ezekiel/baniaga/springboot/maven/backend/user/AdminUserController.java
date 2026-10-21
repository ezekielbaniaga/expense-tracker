package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import ezekiel.baniaga.springboot.maven.backend.session.dto.RevokedSessionsResponse;
import ezekiel.baniaga.springboot.maven.backend.session.dto.SessionResponse;
import ezekiel.baniaga.springboot.maven.backend.user.dto.AdminUserResponse;
import ezekiel.baniaga.springboot.maven.backend.user.dto.UpdateUserRequest;
import ezekiel.baniaga.springboot.maven.backend.user.dto.UserListResponse;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import ezekiel.baniaga.springboot.maven.backend.user.mapper.UserMapper;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Admin user management. SecurityConfig already limits /users/** to ADMIN;
 * @PreAuthorize repeats it per method so a future URL rule change can't
 * open these up. Both only see the role in the access token, so each method
 * also checks the caller is still an enabled ADMIN in the database.
 * {id} is always the unique_id, never the database id.
 */
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
@Slf4j
public class AdminUserController {

    private final UserService userService;
    private final UserMapper userMapper;
    private final UserSessionService userSessionService;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public UserListResponse list(
        @RequestParam(required = false) String username,
        @RequestParam(required = false) Boolean enabled,
        @RequestParam(required = false) String sort,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @AuthenticationPrincipal CustomUserDetails admin) {

        userService.requireEnabledAdmin(admin.getUniqueId());
        Page<User> users = userService.listUsers(username, enabled, sort, page, size);
        return new UserListResponse(
            users.getContent().stream().map(userMapper::toAdminResponse).toList(),
            users.getNumber(),
            users.getSize(),
            users.getTotalElements(),
            users.getTotalPages());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public AdminUserResponse get(@PathVariable UUID id, @AuthenticationPrincipal CustomUserDetails admin) {
        userService.requireEnabledAdmin(admin.getUniqueId());
        return userMapper.toAdminResponse(userService.getByUniqueId(id));
    }

    /**
     * The user's active sessions, most recently used first. current marks
     * only the admin's own session (their token's sid), so it is false for
     * every row unless the admin lists their own id. 404 USER_NOT_FOUND.
     * /users/me/sessions is UserController's, a more specific match than this.
     */
    @GetMapping("/{id}/sessions")
    @PreAuthorize("hasRole('ADMIN')")
    public List<SessionResponse> sessions(@PathVariable UUID id, @AuthenticationPrincipal CustomUserDetails admin) {
        userService.requireEnabledAdmin(admin.getUniqueId());
        return userSessionService.listActiveSessions(id, admin.getSessionId());
    }

    /**
     * Revokes every active session of the user: their refresh tokens stop
     * working, access tokens stay valid until they expire. 200 with the number
     * revoked (0 when there was nothing to revoke). 404 USER_NOT_FOUND.
     * An admin may revoke their own sessions, the current one included;
     * unlike PATCH this is not a CANNOT_MODIFY_SELF case.
     */
    @DeleteMapping("/{id}/sessions")
    @PreAuthorize("hasRole('ADMIN')")
    public RevokedSessionsResponse revokeSessions(@PathVariable UUID id, @AuthenticationPrincipal CustomUserDetails admin) {
        userService.requireEnabledAdmin(admin.getUniqueId());
        int revoked = userSessionService.revokeAllForUser(userService.getByUniqueId(id).getId());

        log.info("Admin {} revoked {} session(s) of user {}", admin.getUniqueId(), revoked, id);
        return new RevokedSessionsResponse(revoked);
    }

    /**
     * Revokes one session of the user. 204, also when it was already revoked.
     * 404 SESSION_NOT_FOUND if the user doesn't exist or the session isn't theirs,
     * so another user's session can't be ended through the wrong id.
     */
    @DeleteMapping("/{id}/sessions/{sessionId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> revokeSession(
        @PathVariable UUID id,
        @PathVariable UUID sessionId,
        @AuthenticationPrincipal CustomUserDetails admin) {

        userService.requireEnabledAdmin(admin.getUniqueId());
        userSessionService.revokeOwnSession(id, sessionId);

        log.info("Admin {} revoked session {} of user {}", admin.getUniqueId(), sessionId, id);
        return ResponseEntity.noContent().build();
    }

    /**
     * 403 if the caller is no longer an enabled ADMIN (checked in the service,
     * under the admin lock). 409 CONCURRENT_MODIFICATION on a stale version, CANNOT_MODIFY_SELF or
     * LAST_ADMIN for the guard rails. Disabling or demoting revokes all
     * the user's sessions, forcing a new login. A promotion revokes nothing and
     * applies at the user's next /auth/refresh, which reads the role from the database.
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
