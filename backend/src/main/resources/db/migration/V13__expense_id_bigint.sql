-- Expense.id is a Long in Java, but V1 created expense.id as SERIAL (32-bit).
-- Widen it to BIGINT, along with the sequence behind it, so the schema matches
-- the entity. Expenses grow much faster than users, so this matters more than V12.
--
-- No foreign key or view references expense.id; the primary key index is
-- rebuilt by the type change.
ALTER TABLE expense ALTER COLUMN id TYPE BIGINT;

-- The sequence's max value was the INTEGER max; AS BIGINT raises it to the BIGINT max
ALTER SEQUENCE expense_id_seq AS BIGINT;
