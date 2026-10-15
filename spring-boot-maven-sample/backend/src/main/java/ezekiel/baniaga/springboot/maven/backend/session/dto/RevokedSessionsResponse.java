package ezekiel.baniaga.springboot.maven.backend.session.dto;

/**
 * Result of a bulk revoke: how many active sessions were ended.
 * Sessions that were already revoked are not counted.
 */
public record RevokedSessionsResponse(int revoked){}
