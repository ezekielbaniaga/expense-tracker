package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import ezekiel.baniaga.springboot.maven.backend.session.dto.SessionResponse;
import ezekiel.baniaga.springboot.maven.backend.user.dto.ChangePasswordRequest;
import ezekiel.baniaga.springboot.maven.backend.user.dto.UserResponse;
import ezekiel.baniaga.springboot.maven.backend.user.mapper.UserMapper;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Self-service endpoints for the logged-in user. SecurityConfig lets any
 * authenticated user reach /users/me; the rest of /users/** is ADMIN only.
 */
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserMapper userMapper;
    private final UserSessionService userSessionService;

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal CustomUserDetails user) {
        return userMapper.toResponse(userService.getByUniqueId(user.getUniqueId()));
    }

    /**
     * Your active sessions, most recently used first. The session of the
     * access token used for this call has current: true (none for tokens
     * without a sid claim).
     */
    @GetMapping("/me/sessions")
    public List<SessionResponse> sessions(@AuthenticationPrincipal CustomUserDetails user) {
        return userSessionService.listActiveSessions(user.getUniqueId(), user.getSessionId());
    }

    /**
     * Revokes one of your sessions: its refresh token stops working, its
     * access token stays valid until it expires. 204, also when the session
     * was already revoked; revoking the current one works like logout.
     * 404 SESSION_NOT_FOUND if the session isn't yours.
     */
    @DeleteMapping("/me/sessions/{sessionId}")
    public ResponseEntity<Void> revokeSession(
        @AuthenticationPrincipal CustomUserDetails user,
        @PathVariable UUID sessionId) {

        userSessionService.revokeOwnSession(user.getUniqueId(), sessionId);

        return ResponseEntity.noContent().build();
    }

    /**
     * 204 on success. Every session of the user is revoked, so all refresh
     * tokens (including the caller's) stop working; log in again with the
     * new password. 400 INVALID_CURRENT_PASSWORD or INVALID_PASSWORD otherwise.
     */
    @PostMapping("/me/password")
    public ResponseEntity<Void> changePassword(
        @AuthenticationPrincipal CustomUserDetails user,
        @Valid @RequestBody ChangePasswordRequest request) {

        userService.changePassword(user.getUniqueId(), request.currentPassword(), request.newPassword());

        return ResponseEntity.noContent().build();
    }
}
