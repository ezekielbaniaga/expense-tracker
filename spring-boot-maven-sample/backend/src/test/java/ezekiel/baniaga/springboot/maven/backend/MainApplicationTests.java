package ezekiel.baniaga.springboot.maven.backend;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class MainApplicationTests {

	@Value("${spring.jpa.open-in-view}")
	boolean openInView;

	@Test
	void contextLoads() {
	}

	@Test
	void openInViewIsOff() {
		assertThat(openInView).isFalse();
	}

}
