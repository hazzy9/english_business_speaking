-- Run this once against your EXISTING database:
--   npx wrangler d1 execute speaking_practice_db --remote --file=./migrations/006_audio_key.sql
--
-- Adds audio_key to submissions, so a saved recording's R2 key can be
-- stored alongside its transcript. NULL for submissions where the student
-- opted out of saving audio (the "Save my recording" checkbox unchecked).
ALTER TABLE submissions ADD COLUMN audio_key TEXT;
