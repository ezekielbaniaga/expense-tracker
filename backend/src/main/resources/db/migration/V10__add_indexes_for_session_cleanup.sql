-- Session cleanup (UserSessionRepository.deleteEndedBefore) runs every minute
-- from 3:00 to 3:59 and filters on "expires_at < cutoff OR revoked_at < cutoff".
-- Without these it scans the whole table, which grows by one row per login.
--
-- One index per column, not a composite: a composite (expires_at, revoked_at)
-- cannot serve an OR, while two single-column indexes let Postgres combine
-- them with a BitmapOr.
--
-- revoked_at is NULL for most sessions, and "revoked_at < cutoff" never
-- matches NULL, so that index only covers revoked rows (partial index).
CREATE INDEX idx_user_sessions_expires_at
    ON user_sessions(expires_at);

CREATE INDEX idx_user_sessions_revoked_at
    ON user_sessions(revoked_at)
    WHERE revoked_at IS NOT NULL;
