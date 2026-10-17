package ezekiel.baniaga.springboot.maven.backend.auth.security;

import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

@Component
@RequiredArgsConstructor
public class JWTAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_TOKEN = "Bearer ";
    private static final int HEADER_WITHOUT_BEARER_IDX = 7;

    private final JWTService jwtService;
    private final CustomUserDetailsMapper mapper;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);

        if (header == null || !header.startsWith(BEARER_TOKEN)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = header.substring(HEADER_WITHOUT_BEARER_IDX);

        // Verify and read the token in one parse. When invalid, skip updating security context
        Optional<JWTPrincipal> parsed = jwtService.parsePrincipal(token);
        if (parsed.isEmpty()) {
            filterChain.doFilter(request, response);
            return;
        }

        // Note: We eliminated db call every request. For certain cases where immediate
        // check to db is necessary, use these commented lines:
        // e.g. Quickly check 'enabled' flag
        //
        // String username = jwtService.extractUsername(token);
        // UserDetails userDetails = databaseUserDetailsService.loadUserByUsername(username);

        // Update security context for later use on @PreAuthorize or @AuthenticationPrincipal
        CustomUserDetails userDetails = mapper.toCustomUserDetails(parsed.get());

        UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
            userDetails, null, userDetails.getAuthorities());

        // Future-proof:
        // Check first if there are other authentication mechanism coexist (OAuth2, API keys, etc.)
        // to prevent overwriting an authentication that another filter has already established.
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            SecurityContextHolder.getContext().setAuthentication(authToken);
        }

        filterChain.doFilter(request, response);
    }
}
