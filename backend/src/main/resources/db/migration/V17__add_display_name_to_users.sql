-- Optional name shown in the UI (initials, greeting). Null until the user sets one.
ALTER TABLE users ADD COLUMN display_name VARCHAR(100);
