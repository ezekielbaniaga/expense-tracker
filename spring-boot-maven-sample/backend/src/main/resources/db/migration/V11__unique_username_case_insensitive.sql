-- Usernames are unique regardless of case, so "Alice" and "alice" cannot both
-- exist. V5's UNIQUE on username is case-sensitive and stays as it is.
-- UserRepository.findByUsername compares lower(username), so it uses this index.
--
-- If existing rows already clash, creating the index would fail with a generic
-- "could not create unique index" error. Check first and fail with the clashing
-- names instead. The migration then rolls back and the app does not start;
-- rename or remove the duplicates by hand and restart.
DO $$
DECLARE
    clashes TEXT;
BEGIN
    SELECT string_agg(names, '; ')
      INTO clashes
      FROM (SELECT string_agg(username, ', ' ORDER BY username) AS names
              FROM users
             GROUP BY lower(username)
            HAVING count(*) > 1) AS dup;

    IF clashes IS NOT NULL THEN
        RAISE EXCEPTION 'V11: usernames differ only in case, resolve them before migrating: %', clashes;
    END IF;
END $$;

CREATE UNIQUE INDEX ux_users_username_lower
    ON users (lower(username));
