-- Run this once against your EXISTING database:
--   npx wrangler d1 execute speaking_practice_db --remote --file=./migrations/004_more_questions.sql
--
-- Adds more questions to Daily, Business, and Scenario, plus two new
-- categories: Opinion (agree/disagree style — good for justifying a view)
-- and Storytelling (personal-narrative practice). Edit or delete any of
-- these from the teacher page any time.

INSERT INTO questions (prompt, category) VALUES
  ('What''s your favorite season and why?', 'Daily'),
  ('Describe a hobby you enjoy.', 'Daily'),
  ('What''s the best meal you''ve had recently?', 'Daily'),
  ('What''s a habit you''re trying to build?', 'Daily'),
  ('How do you like to relax after a long day?', 'Daily'),

  ('Describe how you handle stress at work.', 'Business'),
  ('What''s a professional goal you''re working toward?', 'Business'),
  ('How do you give feedback to a teammate?', 'Business'),
  ('Describe a time you had to learn something new quickly for work.', 'Business'),
  ('What makes a good leader, in your opinion?', 'Business'),

  ('You''re running late for an important meeting. How do you explain it?', 'Scenario'),
  ('A colleague takes credit for your idea. What do you say?', 'Scenario'),
  ('You need to ask your boss for a day off. How do you phrase it?', 'Scenario'),
  ('You''re at a networking event and don''t know anyone. How do you start a conversation?', 'Scenario'),
  ('Your package arrived damaged. How do you contact customer service?', 'Scenario'),

  ('Do you think remote work is better than working in an office? Why?', 'Opinion'),
  ('Is it better to specialize in one skill or have many skills?', 'Opinion'),
  ('Do you prefer planning ahead or being spontaneous?', 'Opinion'),
  ('Should companies allow a 4-day work week?', 'Opinion'),
  ('Is social media more helpful or harmful?', 'Opinion'),

  ('Tell me about a time you overcame a challenge.', 'Storytelling'),
  ('Describe a trip that didn''t go as planned.', 'Storytelling'),
  ('Tell me about a mistake you learned from.', 'Storytelling'),
  ('Describe a moment you felt really confident.', 'Storytelling'),
  ('Tell me about someone who changed your perspective on something.', 'Storytelling');