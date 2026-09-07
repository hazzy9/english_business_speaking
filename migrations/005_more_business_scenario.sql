-- Run this once against your EXISTING database:
--   npx wrangler d1 execute speaking_practice_db --remote --file=./migrations/005_more_business_scenario.sql
--
-- Adds 5 more questions each to Business and Scenario, bringing both up
-- to 10. Daily, Opinion, Storytelling, and Vocabulary are untouched.

INSERT INTO questions (prompt, category) VALUES
  ('How do you stay motivated on a long-term project?', 'Business'),
  ('Describe a negotiation you''ve been part of.', 'Business'),
  ('What''s your approach to managing a tight deadline?', 'Business'),
  ('How do you build trust with a new client or colleague?', 'Business'),
  ('What would you do if you disagreed with a decision your company made?', 'Business'),

  ('You accidentally CC''d the wrong person on a sensitive email. What do you do?', 'Scenario'),
  ('A client calls angry about a delay. How do you respond?', 'Scenario'),
  ('You''re asked a question in a meeting you don''t know the answer to. What do you say?', 'Scenario'),
  ('Your coworker keeps interrupting you in meetings. How do you address it?', 'Scenario'),
  ('You need to cancel a meeting last minute. How do you let people know?', 'Scenario');