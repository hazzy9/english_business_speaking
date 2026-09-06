-- Run this once against your EXISTING database:
--   npx wrangler d1 execute speaking_practice_db --remote --file=./migrations/003_question_rotation.sql
--
-- Adds tracking so the next-question picker prefers questions that have
-- been asked less, instead of pure random (which could repeat a question
-- several times before ever reaching another one).

ALTER TABLE questions ADD COLUMN times_served INTEGER DEFAULT 0;
ALTER TABLE questions ADD COLUMN last_served_at DATETIME;