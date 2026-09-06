-- Run this once against your EXISTING database — it only adds the new
-- vocabulary table, it doesn't touch anything you already have.
--
--   npx wrangler d1 execute speaking_practice_db --remote --file=./migrations/002_vocabulary.sql
--
-- (schema.sql has also been updated to include this table, for anyone
-- setting the app up fresh from scratch in the future.)

CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    korean TEXT,
    question_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(question_id) REFERENCES questions(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_word ON vocabulary (word COLLATE NOCASE);