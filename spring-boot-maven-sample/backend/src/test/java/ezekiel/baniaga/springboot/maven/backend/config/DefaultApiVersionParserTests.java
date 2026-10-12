package ezekiel.baniaga.springboot.maven.backend.config;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

// Plain unit test: no Spring context needed
class DefaultApiVersionParserTests {

    private final DefaultApiVersionParser parser = new DefaultApiVersionParser();

    @ParameterizedTest
    @CsvSource({
        "1.0,  1.0",
        "1.1,  1.1",
        "1,    1.0",
        "v1.0, 1.0",
        "V1.1, 1.1",
        "v1,   1.0",
        "v2,   2.0",
    })
    void normalizesVersion(String header, String expected) {
        assertThat(parser.parseVersion(header)).isEqualTo(expected);
    }
}
