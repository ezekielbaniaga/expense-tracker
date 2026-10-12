-- Expenses belong to a user. The owner is stored by users.unique_id
-- (the id carried in the JWT), so requests need no extra user lookup.
ALTER TABLE users ADD CONSTRAINT uq_users_unique_id UNIQUE (unique_id);

ALTER TABLE expense ADD COLUMN owner_id uuid;

-- Existing expenses predate ownership: give them to the admin
-- (or the oldest user if there is no admin).
UPDATE expense SET owner_id = COALESCE(
    (SELECT unique_id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1),
    (SELECT unique_id FROM users ORDER BY id LIMIT 1)
);

ALTER TABLE expense ALTER COLUMN owner_id SET NOT NULL;

ALTER TABLE expense ADD CONSTRAINT fk_expense_owner
    FOREIGN KEY (owner_id) REFERENCES users(unique_id);

CREATE INDEX index_expense_owner_id
ON expense USING BTREE (owner_id);
