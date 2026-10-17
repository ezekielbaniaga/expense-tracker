CREATE TABLE user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL,
    user_agent VARCHAR(500),
    ip_address VARCHAR(45),
    created_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,

    CONSTRAINT fk_user_sessions_users
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE UNIQUE index idx_user_sessions_hash
    ON user_sessions(refresh_token_hash);