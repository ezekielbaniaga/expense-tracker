package ezekiel.baniaga.springboot.maven.backend.auth.props;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.admin")
@Getter @Setter
public class AdminBootstrapProperties {

    private String username;
    private String password;

}
