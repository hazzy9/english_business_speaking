-- Run this once against your EXISTING database:
--   npx wrangler d1 execute speaking_practice_db --remote --file=./migrations/007_archive_answered_questions.sql
--
-- Adds an "active" flag so a question can be retired from the daily
-- rotation without deleting it — deleting would also wipe her submission
-- history for it, since the history view JOINs submissions to questions.
-- Retired questions never show up in the "next question" picker, but the
-- teacher page still lists everything, so nothing here is destructive.
--
-- Also retires every question that's already been answered at least once,
-- now that real lesson-based questions are being added to replace the
-- old generic starter bank.

ALTER TABLE questions ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

UPDATE questions SET active = 0
WHERE id IN (SELECT DISTINCT question_id FROM submissions);
