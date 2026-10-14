package ezekiel.baniaga.springboot.maven.backend.user;

import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.user.dto.ChangePasswordRequest;
import ezekiel.baniaga.springboot.maven.backend.user.dto.UserResponse;
import ezekiel.baniaga.springboot.maven.backend.user.mapper.UserMapper;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal CustomUserDetails user) {
        return userMapper.toResponse(userService.getByUniqueId(user.getUniqueId()));
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
