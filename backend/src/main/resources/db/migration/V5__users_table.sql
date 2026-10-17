CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    unique_id uuid NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL,
    created_at TIMESTAMP NOT NULL,
    last_modified TIMESTAMP
);

CREATE INDEX index_users_unique_id
ON users USING BTREE (unique_id)