-- Public id for a session, so the session management endpoints and the
-- access token's "sid" claim never expose the internal BIGSERIAL id.
-- Existing rows are backfilled before the column becomes NOT NULL.
ALTER TABLE user_sessions ADD COLUMN unique_id UUID;
UPDATE user_sessions SET unique_id = gen_random_uuid();
ALTER TABLE user_sessions ALTER COLUMN unique_id SET NOT NULL;

CREATE UNIQUE INDEX idx_user_sessions_unique_id
    ON user_sessions(unique_id);

-- Listing a user's sessions and revokeAllForUser both filter on user_id.
-- A plain index (not partial) also serves the ON DELETE CASCADE from users.
CREATE INDEX idx_user_sessions_user_id
    ON user_sessions(user_id);
