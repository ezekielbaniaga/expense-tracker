package ezekiel.baniaga.springboot.maven.backend.bootstrap;

import ezekiel.baniaga.springboot.maven.backend.auth.service.JWTBootstrapService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!test")
@RequiredArgsConstructor
public class JWTBootstrapRunner implements ApplicationRunner {

    private final JWTBootstrapService jwtBootstrapService;

    @Override
    public void run(ApplicationArguments args) throws Exception {
        jwtBootstrapService.checkEnvironmentVariable();
    }
}
