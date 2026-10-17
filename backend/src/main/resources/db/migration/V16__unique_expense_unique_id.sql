-- expense.unique_id is the public id every expense endpoint looks up by
-- (ExpenseRepository.findByUniqueIdAndOwnerId returns an Optional), but V1 only
-- gave it a plain index. Two rows sharing one id would make that lookup throw.
-- Make it unique, like users.unique_id (V9) and user_sessions.unique_id (V14).
--
-- If existing rows already share an id, creating the index would fail with a
-- generic "could not create unique index" error. Check first and fail with the
-- duplicated ids instead. The migration then rolls back and the app does not
-- start; give the duplicates new ids or remove them by hand and restart.
DO $$
DECLARE
    duplicates TEXT;
BEGIN
    SELECT string_agg(unique_id::text, ', ' ORDER BY unique_id)
      INTO duplicates
      FROM (SELECT unique_id
              FROM expense
             GROUP BY unique_id
            HAVING count(*) > 1) AS dup;

    IF duplicates IS NOT NULL THEN
        RAISE EXCEPTION 'V16: expenses share a unique_id, resolve them before migrating: %', duplicates;
    END IF;
END $$;

CREATE UNIQUE INDEX ux_expense_unique_id
    ON expense (unique_id);

-- The unique index serves the same lookups, so V1's plain index is redundant
DROP INDEX IF EXISTS index_expense_unique_id;
