CREATE TABLE expense(
    id SERIAL PRIMARY KEY,
    unique_id uuid NOT NULL,
    description VARCHAR(255),
    amount NUMERIC(10,2),
    category VARCHAR(50),
    expense_date DATE,
    created_at TIMESTAMP
);

CREATE INDEX index_expense_unique_id
ON expense USING BTREE (unique_id)