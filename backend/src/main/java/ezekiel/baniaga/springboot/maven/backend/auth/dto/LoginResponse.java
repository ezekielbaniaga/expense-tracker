package ezekiel.baniaga.springboot.maven.backend.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

/**
 * Returned by login and refresh.
 *
 * @param refreshToken          null (and left out of the JSON) when login set it as a cookie
 * @param accessTokenExpiresIn  seconds the access token is valid from now (app.jwt.expiration)
 * @param refreshTokenExpiresAt when the session ends (its expires_at), a UTC time without
 *                              offset like every API timestamp; refreshing does not move it
 */
public record LoginResponse (

    String accessToken,

    @JsonInclude(JsonInclude.Include.NON_NULL)
    String refreshToken,

    long accessTokenExpiresIn,

    LocalDateTime refreshTokenExpiresAt
){}
