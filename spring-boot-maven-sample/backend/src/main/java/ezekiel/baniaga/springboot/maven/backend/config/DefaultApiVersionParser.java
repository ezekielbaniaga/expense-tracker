package ezekiel.baniaga.springboot.maven.backend.config;

import org.springframework.stereotype.Component;

@Component
public class DefaultApiVersionParser implements org.springframework.web.accept.ApiVersionParser {

    // Accepts "1.1", "v1.1", "V1.1"; a bare major version like "1" or "v1" becomes "1.0"
    @Override
    public Comparable parseVersion(String version) {
        // Not String.matches: it must match the whole string, so "^[vV]" never matched "v1.0"
        if (version.startsWith("v") || version.startsWith("V")) {
            version = version.substring(1);
        }
        if (version.matches("\\d+")) {
            version = version + ".0";
        }

        return version;
    }
}
