-- Speaking Practice App — D1 schema

CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    transcript TEXT,
    ai_feedback TEXT,
    teacher_feedback TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'reviewed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(question_id) REFERENCES questions(id)
);

-- Simple key/value store for app-wide settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('active_category', 'General');
INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_limit', '3');
INSERT OR IGNORE INTO settings (key, value) VALUES ('last_question_id', '0');

-- A few starter questions so the app isn't empty on first run.
-- Add/remove these from the teacher page any time.
INSERT INTO questions (prompt, category) VALUES
  ('What''s your dream vacation?', 'General'),
  ('Describe your perfect weekend.', 'General'),
  ('What''s a skill you''d love to learn?', 'General'),
  ('What does your ideal morning look like?', 'General'),
  ('What''s something you''re proud of?', 'General');