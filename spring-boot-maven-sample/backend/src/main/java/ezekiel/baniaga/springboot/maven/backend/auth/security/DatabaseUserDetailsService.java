package ezekiel.baniaga.springboot.maven.backend.auth.security;

import ezekiel.baniaga.springboot.maven.backend.auth.mapper.CustomUserDetailsMapper;
import ezekiel.baniaga.springboot.maven.backend.user.UserRepository;
import ezekiel.baniaga.springboot.maven.backend.user.UsernameValidator;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class DatabaseUserDetailsService implements UserDetailsService {

    private final UserRepository repository;
    private final CustomUserDetailsMapper mapper;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        // Exact name first, so accounts created before registration stripped
        // names keep working; then the stripped name, so " alice" finds "alice"
        User user = repository.findByUsername(username)
            .or(() -> {
                String stripped = UsernameValidator.normalize(username);
                return stripped.equals(username) ? Optional.empty() : repository.findByUsername(stripped);
            })
            .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        return mapper.toCustomUserDetails(user);
    }
}
