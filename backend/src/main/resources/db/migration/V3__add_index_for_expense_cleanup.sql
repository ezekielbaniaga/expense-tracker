CREATE INDEX index_expense_cleanup
ON expense USING BTREE (archived,archived_at);
