package ezekiel.baniaga.springboot.maven.backend.common;

public final class LikeEscaper {

    private LikeEscaper() {
    }

    /** Escapes LIKE wildcards so user input matches literally; pair with escape char '\'. */
    public static String escape(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
