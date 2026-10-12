package ezekiel.baniaga.springboot.maven.backend.session;

import ezekiel.baniaga.springboot.maven.backend.session.entity.UsedRefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UsedRefreshTokenRepository extends JpaRepository<UsedRefreshToken, String> {
}
