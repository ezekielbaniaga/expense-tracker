package ezekiel.baniaga.springboot.maven.backend.auth.security;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.jspecify.annotations.Nullable;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@AllArgsConstructor
public class CustomUserDetails implements UserDetails {

    @Getter
    private final Long databaseId;
    @Getter
    private final UUID uniqueId;
    private final String username;
    private final String password;
    @Getter
    private final String role;
    private final boolean enabled;
    // The sid claim of the access token; null when loaded from the database or for older tokens
    @Getter
    private final @Nullable UUID sessionId;

    public CustomUserDetails(Long databaseId, UUID uniqueId, String username, String password,
                             String role, boolean enabled) {
        this(databaseId, uniqueId, username, password, role, enabled, null);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + this.role));
    }

    @Override
    public @Nullable String getPassword() {
        return this.password;
    }

    @Override
    public String getUsername() {
        return this.username;
    }

    @Override
    public boolean isEnabled() {
        return this.enabled;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }
}
