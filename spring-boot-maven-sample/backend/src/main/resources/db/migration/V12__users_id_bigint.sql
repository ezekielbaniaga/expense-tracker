-- User.id is a Long in Java, but V5 created users.id as SERIAL (32-bit)
-- and V7 made user_sessions.user_id INTEGER to match. Widen both to BIGINT,
-- along with the sequence behind users.id, so the schema matches the entity.
--
-- The foreign key is dropped and re-added around the type change so both
-- sides change together and the constraint is checked once against the new types.
ALTER TABLE user_sessions DROP CONSTRAINT fk_user_sessions_users;

ALTER TABLE users ALTER COLUMN id TYPE BIGINT;
ALTER TABLE user_sessions ALTER COLUMN user_id TYPE BIGINT;

-- The sequence's max value was the INTEGER max; AS BIGINT raises it to the BIGINT max
ALTER SEQUENCE users_id_seq AS BIGINT;

ALTER TABLE user_sessions
    ADD CONSTRAINT fk_user_sessions_users
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
