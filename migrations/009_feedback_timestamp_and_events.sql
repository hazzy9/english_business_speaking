-- Run this once against your EXISTING database:
--   npx wrangler d1 execute speaking_practice_db --remote --file=./migrations/009_feedback_timestamp_and_events.sql
--
-- Two additions:
-- 1. feedback_updated_at on submissions — set whenever teacher feedback is
--    saved, so the student page can show a "New Feedback" section for
--    anything reviewed in the last 24 hours (separate from created_at,
--    which is when she originally recorded the answer).
-- 2. events — a small log of specific UI interactions we want visibility
--    into (14-day history opens, New Feedback expands, new-question
--    clicks). Not general analytics — just the handful of things worth
--    knowing about for a single student, logged best-effort from the
--    client.

ALTER TABLE submissions ADD COLUMN feedback_updated_at DATETIME;

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
