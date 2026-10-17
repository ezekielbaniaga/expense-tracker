package ezekiel.baniaga.springboot.maven.backend.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ApiVersionConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMVCConfig implements WebMvcConfigurer {

    private final DefaultApiVersionParser apiVersionParser;

    @Override
    public void configureApiVersioning(ApiVersionConfigurer configurer) {
        configurer.addSupportedVersions("1.0", "1.1", "1.2");

        configurer.setDefaultVersion("1.0");
        configurer.setVersionParser(apiVersionParser);
        configurer.useRequestHeader("X-API-Version");
    }
}
