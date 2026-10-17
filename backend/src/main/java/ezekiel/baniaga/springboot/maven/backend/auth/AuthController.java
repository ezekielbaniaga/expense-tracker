package ezekiel.baniaga.springboot.maven.backend.auth;

import ezekiel.baniaga.springboot.maven.backend.auth.dto.LoginRequest;
import ezekiel.baniaga.springboot.maven.backend.auth.dto.LoginResponse;
import ezekiel.baniaga.springboot.maven.backend.auth.dto.RefreshTokenRequest;
import ezekiel.baniaga.springboot.maven.backend.auth.dto.RegisterRequest;
import ezekiel.baniaga.springboot.maven.backend.auth.props.JWTProperties;
import ezekiel.baniaga.springboot.maven.backend.auth.props.RefreshCookieProperties;
import ezekiel.baniaga.springboot.maven.backend.auth.security.CustomUserDetails;
import ezekiel.baniaga.springboot.maven.backend.auth.security.JWTService;
import ezekiel.baniaga.springboot.maven.backend.auth.service.AuthEndpointRateLimiter;
import ezekiel.baniaga.springboot.maven.backend.auth.service.LoginRateLimiter;
import ezekiel.baniaga.springboot.maven.backend.common.BadRequestException;
import ezekiel.baniaga.springboot.maven.backend.common.ForbiddenException;
import ezekiel.baniaga.springboot.maven.backend.session.CreatedSession;
import ezekiel.baniaga.springboot.maven.backend.session.RefreshTokenResult;
import ezekiel.baniaga.springboot.maven.backend.session.UserSessionService;
import ezekiel.baniaga.springboot.maven.backend.session.entity.UserSession;
import ezekiel.baniaga.springboot.maven.backend.user.UserService;
import ezekiel.baniaga.springboot.maven.backend.user.dto.UserResponse;
import ezekiel.baniaga.springboot.maven.backend.user.mapper.UserMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.WebUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Set;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    /** Login with this header set to "cookie" gets the refresh token as an HttpOnly cookie. */
    static final String REFRESH_TOKEN_TRANSPORT_HEADER = "X-Refresh-Token-Transport";
    private static final String COOKIE_TRANSPORT = "cookie";

    private final AuthenticationManager authenticationManager;
    private final JWTService jwtService;
    private final JWTProperties jwtProperties;
    private final RefreshCookieProperties refreshCookieProperties;
    private final Clock clock;
    private final LoginRateLimiter loginRateLimiter;
    private final AuthEndpointRateLimiter authEndpointRateLimiter;
    private final Validator validator;

    private final UserSessionService userSessionService;

    private final UserService userService;
    private final UserMapper userMapper;

    /**
     * Creates a USER account. Returns no tokens; the client logs in next.
     * 409 USERNAME_TAKEN if the name exists in any case, 400 INVALID_PASSWORD
     * if the password breaks the rules in PasswordValidator.
     * 429 TOO_MANY_REQUESTS after too many registrations from one client IP.
     */
    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(
        @Valid @RequestBody RegisterRequest request,
        HttpServletRequest httpServletRequest) {

        // Before hashing the password, so a flood costs no BCrypt work
        authEndpointRateLimiter.register(httpServletRequest.getRemoteAddr());

        UserResponse user = userMapper.toResponse(
            userService.register(request.username(), request.password()));

        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }

    /**
     * 429 TOO_MANY_REQUESTS (with Retry-After) after too many attempts from one client IP,
     * or too many failed ones for one username (from that IP, or from all IPs). See LoginRateLimiter.
     * With X-Refresh-Token-Transport: cookie the refresh token is set as an HttpOnly cookie
     * (see RefreshCookieProperties) and left out of the body; otherwise the body carries it.
     */
    @PostMapping("/login")
    public LoginResponse login(
        @Valid @RequestBody LoginRequest loginRequest,
        @RequestHeader(name = REFRESH_TOKEN_TRANSPORT_HEADER, required = false) String refreshTokenTransport,
        HttpServletRequest httpServletRequest,
        HttpServletResponse httpServletResponse) {

        UsernamePasswordAuthenticationToken uptoken =
            UsernamePasswordAuthenticationToken.unauthenticated(
                loginRequest.username(), loginRequest.password());

        // Before the password check, so a locked-out username costs no BCrypt work
        loginRateLimiter.beforeAttempt(loginRequest.username(), httpServletRequest.getRemoteAddr());

        // Internally, Spring Security will use the provided UserDetailsService and PasswordEncoder
        // to authenticate the credentials
        Authentication authentication = authenticationManager.authenticate(uptoken);
        loginRateLimiter.succeeded(loginRequest.username(), httpServletRequest.getRemoteAddr());

        // Construct and response a JWT token if authentication was a success
        CustomUserDetails userDetails = (CustomUserDetails) authentication.getPrincipal();

        // Session first, so the access token can carry its id as the sid claim
        // Re-checks the user under its row lock: a password change or disable may have
        // committed while the password was being checked
        CreatedSession created = userSessionService.createSession(
            userDetails,
            httpServletRequest.getHeader(HttpHeaders.USER_AGENT),
            httpServletRequest.getRemoteAddr()
        );

        String token = jwtService.generateToken(created.userDetails(), created.sessionId());

        if (COOKIE_TRANSPORT.equalsIgnoreCase(refreshTokenTransport)) {
            httpServletResponse.addHeader(HttpHeaders.SET_COOKIE,
                refreshCookie(created.rawRefreshToken(), created.expiresAt()).toString());
            return new LoginResponse(token, null, accessTokenExpiresIn(), created.expiresAt());
        }

        return new LoginResponse(
            token, created.rawRefreshToken(), accessTokenExpiresIn(), created.expiresAt());
    }

    /**
     * The refresh token comes from the body or, when the body is absent, from the
     * refresh cookie; a body token wins. Cookie mode needs an Origin listed in
     * RefreshCookieProperties (else 403 ORIGIN_NOT_ALLOWED), sets the rotated token
     * as the cookie and leaves it out of the body; a 401 there clears the cookie.
     * Neither body nor cookie is 401 AUTHENTICATION_REQUIRED, like an unknown token.
     * 429 TOO_MANY_REQUESTS after too many refreshes from one client IP.
     */
    @PostMapping("/refresh")
    public LoginResponse refresh(
        @Valid @RequestBody(required = false) RefreshTokenRequest request,
        HttpServletRequest httpServletRequest,
        HttpServletResponse httpServletResponse) {

        authEndpointRateLimiter.refresh(httpServletRequest.getRemoteAddr());

        if (request != null) {
            RefreshTokenResult result = userSessionService.rotateRefreshToken(request.refreshToken());
            return refreshResponse(result, result.newRawRefreshToken());
        }

        String cookieToken = refreshTokenFromCookie(httpServletRequest);
        RefreshTokenResult result;
        try {
            result = userSessionService.rotateRefreshToken(cookieToken);
        } catch (AuthenticationException e) {
            // Revoked, expired, reused or disabled: the browser should drop the cookie
            httpServletResponse.addHeader(HttpHeaders.SET_COOKIE, clearedRefreshCookie().toString());
            throw e;
        }

        httpServletResponse.addHeader(HttpHeaders.SET_COOKIE,
            refreshCookie(result.newRawRefreshToken(), result.expiresAt()).toString());
        return refreshResponse(result, null);
    }

    /**
     * Revokes the session of the given refresh token, read from the body or, when
     * the body is absent, from the refresh cookie (which then needs an allowed
     * Origin, else 403 ORIGIN_NOT_ALLOWED, and is cleared). Always 204, even for
     * unknown tokens, except 401 AUTHENTICATION_REQUIRED with neither body nor
     * cookie and 429 TOO_MANY_REQUESTS after too many logouts from one client IP.
     * The access token stays valid until it expires.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
        @Valid @RequestBody(required = false) RefreshTokenRequest request,
        HttpServletRequest httpServletRequest) {

        authEndpointRateLimiter.logout(httpServletRequest.getRemoteAddr());

        if (request != null) {
            userSessionService.revokeSession(request.refreshToken());
            return ResponseEntity.noContent().build();
        }

        userSessionService.revokeSession(refreshTokenFromCookie(httpServletRequest));

        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, clearedRefreshCookie().toString())
            .build();
    }

    // Rotation keeps the session's expires_at, so this is the login's value
    private LoginResponse refreshResponse(RefreshTokenResult result, String rawRefreshToken) {
        String accessToken = jwtService.generateToken(result.userDetails(), result.sessionId());
        return new LoginResponse(accessToken, rawRefreshToken, accessTokenExpiresIn(), result.expiresAt());
    }

    /**
     * The refresh token from the cookie, for a request without a body. No cookie is
     * 401 like an unknown token. A cookie is sent by the browser on its own, so it
     * counts only from an allowed Origin (CSRF protection is off); its value gets
     * the same checks as the body field. Never log the value.
     */
    private String refreshTokenFromCookie(HttpServletRequest httpServletRequest) {
        Cookie cookie = WebUtils.getCookie(httpServletRequest, refreshCookieProperties.getName());
        if (cookie == null) {
            throw new BadCredentialsException("No refresh token");
        }

        String origin = httpServletRequest.getHeader(HttpHeaders.ORIGIN);
        if (origin == null || !refreshCookieProperties.getAllowedOrigins().contains(origin)) {
            throw new ForbiddenException("ORIGIN_NOT_ALLOWED", "Origin not allowed");
        }

        Set<ConstraintViolation<RefreshTokenRequest>> violations =
            validator.validate(new RefreshTokenRequest(cookie.getValue()));
        if (!violations.isEmpty()) {
            throw new BadRequestException("VALIDATION_ERROR",
                "refreshToken: " + violations.iterator().next().getMessage());
        }

        return cookie.getValue();
    }

    /**
     * The access token's lifetime in seconds, so a client can refresh ahead of
     * expiry without decoding the JWT. The token's exp is issue time plus this.
     */
    private long accessTokenExpiresIn() {
        return jwtProperties.getExpiration().toSeconds();
    }

    /**
     * The refresh token cookie, living until the session ends (expiresAt is UTC).
     * Path=/auth so it goes only to the auth endpoints; never log its value.
     */
    private ResponseCookie refreshCookie(String rawRefreshToken, LocalDateTime expiresAt) {
        Duration maxAge = Duration.between(LocalDateTime.now(clock), expiresAt);
        return refreshCookie(rawRefreshToken, maxAge.isNegative() ? Duration.ZERO : maxAge);
    }

    /** Max-Age=0 with the same name and path, so the browser deletes the cookie. */
    private ResponseCookie clearedRefreshCookie() {
        return refreshCookie("", Duration.ZERO);
    }

    private ResponseCookie refreshCookie(String value, Duration maxAge) {
        return ResponseCookie.from(refreshCookieProperties.getName(), value)
            .httpOnly(true)
            .secure(refreshCookieProperties.isSecure())
            .sameSite("Strict")
            .path("/auth")
            .maxAge(maxAge)
            .build();
    }
}
