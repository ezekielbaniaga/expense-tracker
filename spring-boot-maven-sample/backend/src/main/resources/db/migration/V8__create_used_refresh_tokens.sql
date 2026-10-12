-- Hashes of refresh tokens that were already rotated out.
-- Seeing one again means the token was stolen (or replayed),
-- so the whole session gets revoked.
CREATE TABLE used_refresh_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    session_id BIGINT NOT NULL,
    used_at TIMESTAMP NOT NULL,

    CONSTRAINT fk_used_refresh_tokens_sessions
        FOREIGN KEY (session_id)
        REFERENCES user_sessions(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_used_refresh_tokens_session
    ON used_refresh_tokens(session_id);
