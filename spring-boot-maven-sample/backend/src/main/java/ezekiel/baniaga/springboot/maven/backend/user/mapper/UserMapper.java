package ezekiel.baniaga.springboot.maven.backend.user.mapper;

import ezekiel.baniaga.springboot.maven.backend.user.dto.UserResponse;
import ezekiel.baniaga.springboot.maven.backend.user.entity.User;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {

    public UserResponse toResponse(User user) {
        return new UserResponse(
            user.getUniqueId(),
            user.getUsername(),
            user.getRole(),
            user.getCreatedAt());
    }
}
