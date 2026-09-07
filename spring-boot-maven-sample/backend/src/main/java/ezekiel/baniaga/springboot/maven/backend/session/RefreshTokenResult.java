package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.user.entity.User;

public record RefreshTokenResult(
        User user,
        String newRawRefreshToken
) {
}
