-- V5 created index_users_unique_id, and V9 later added the
-- uq_users_unique_id unique constraint, which brings its own unique index
-- on the same column. Postgres uses the unique index for lookups and for the
-- expense.owner_id foreign key, so the plain index only made every user
-- insert and update maintain two identical B-trees.
DROP INDEX IF EXISTS index_users_unique_id;
