package ezekiel.baniaga.springboot.maven.backend.auth;

import ezekiel.baniaga.springboot.maven.backend.auth.dto.LoginRequest;
import ezekiel.baniaga.springboot.maven.backend.auth.dto.LoginResponse;
import ezekiel.baniaga.springboot.maven.backend.auth.dto.RefreshTokenRequest;
import ezekiel.baniaga.springboot.maven.backend.auth.dto.RegisterRequest;
import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.session.CreatedSession;
import ezekiel.baniaga.springboot.maven.backend.session.RefreshTokenResult;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.dto.UserResponse;
import ezekiel.baniaga.springboot.maven.backend.user.mapper.UserMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JWTService jwtService;

    private final UserSessionService userSessionService;

    private final UserService userService;
    private final UserMapper userMapper;

    /**
     * Creates a USER account. Returns no tokens; the client logs in next.
     * 409 USERNAME_TAKEN if the name exists in any case, 400 INVALID_PASSWORD
     * if the password breaks the rules in PasswordValidator.
     */
    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(
        @Valid @RequestBody RegisterRequest request) {

        UserResponse user = userMapper.toResponse(
            userService.register(request.username(), request.password()));

        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }

    @PostMapping("/login")
    public LoginResponse login(
        @Valid @RequestBody LoginRequest loginRequest,
        HttpServletRequest httpServletRequest) {

        UsernamePasswordAuthenticationToken uptoken =
            UsernamePasswordAuthenticationToken.unauthenticated(
                loginRequest.username(), loginRequest.password());

        // Internally, Spring Security will use the provided UserDetailsService and PasswordEncoder
        // to authenticate the credentials
        Authentication authentication = authenticationManager.authenticate(uptoken);

        // Construct and response a JWT token if authentication was a success
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();

        // Session first, so the access token can carry its id as the sid claim
        CreatedSession created = userSessionService.createSession(
            userDetails.getDatabaseId(),
            httpServletRequest.getHeader(HttpHeaders.USER_AGENT),
            httpServletRequest.getRemoteAddr()
        );

        String token = jwtService.generateToken(userDetails, created.sessionId());

        return new LoginResponse(token, created.rawRefreshToken());
    }

    @PostMapping("/refresh")
    public LoginResponse refresh(
        @Valid @RequestBody RefreshTokenRequest request){

        RefreshTokenResult result =
            userSessionService.rotateRefreshToken(
                request.refreshToken());

        String accessToken =
            jwtService.generateToken(result.userDetails(), result.sessionId());

        return new LoginResponse(
            accessToken, result.newRawRefreshToken());
    }

    /**
     * Revokes the session of the given refresh token. Always 204, even for
     * unknown tokens. The access token stays valid until it expires.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
        @Valid @RequestBody RefreshTokenRequest request) {

        userSessionService.revokeSession(request.refreshToken());

        return ResponseEntity.noContent().build();
    }
}
