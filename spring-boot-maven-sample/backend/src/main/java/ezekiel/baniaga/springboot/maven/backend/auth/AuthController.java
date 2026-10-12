package ezekiel.baniaga.springboot.maven.backend.auth;

import ezekiel.baniaga.springboot.maven.backend.auth.dto.LoginRequest;
import ezekiel.baniaga.springboot.maven.backend.auth.dto.LoginResponse;
import ezekiel.baniaga.springboot.maven.backend.auth.dto.RefreshTokenRequest;
import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.session.RefreshTokenResult;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
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
        String token = jwtService.generateToken(userDetails);

        String refreshToken = userSessionService.createSession(
            userDetails.getDatabaseId(),
            httpServletRequest.getHeader(HttpHeaders.USER_AGENT),
            httpServletRequest.getRemoteAddr()
        );

        return new LoginResponse(token, refreshToken);
    }

    @PostMapping("/refresh")
    public LoginResponse refresh(
        @Valid @RequestBody RefreshTokenRequest request){

        RefreshTokenResult result =
            userSessionService.rotateRefreshToken(
                request.refreshToken());

        String accessToken =
            jwtService.generateToken(result.userDetails());

        return new LoginResponse(
            accessToken, result.newRawRefreshToken());
    }
}
