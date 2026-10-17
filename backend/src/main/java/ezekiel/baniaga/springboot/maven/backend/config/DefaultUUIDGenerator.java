package ezekiel.baniaga.springboot.maven.backend.config;

import com.fasterxml.uuid.Generators;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class DefaultUUIDGenerator {

    // UUID Version 7
    public UUID generate() {
        return Generators.timeBasedEpochGenerator().generate();
    }
}
