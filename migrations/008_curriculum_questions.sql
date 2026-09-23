-- Run this once against your EXISTING database:
--   npx wrangler d1 execute speaking_practice_db --remote --file=./migrations/008_curriculum_questions.sql
--
-- Replaces the old generic question bank with prompts drawn from the 4
-- business-English sessions actually taught (Aug 29 - Sep 21). Weighted
-- toward the most recent material by volume: since /api/questions picks
-- a random category then serves whichever question in it has been asked
-- least, a category's long-run mix is proportional to how many of each
-- session's questions it holds. Session 4 (newest) gets the most entries
-- in each category, tapering down to just a couple from Session 1 for
-- revision.
--
-- Session 4 (Sep 21) — video-call hiccups, stick with/turns out/consistent/
--   not really my thing, countable vs. uncountable
-- Session 3 (Sep 5)  — clarifying & interrupting, move the needle/
--   low-hanging fruit/unwind/into
-- Session 2 (Aug 31) — softeners, pivot/touch base/burnt out/intense
-- Session 1 (Aug 29) — modals for requests, leverage/deliverable/bottleneck

INSERT INTO questions (prompt, category) VALUES
  -- Scenario: roleplay prompts, adapted from each session's scenario slides
  ('You''re on a call and the other person''s audio keeps cutting out, so you can''t quite follow what they''re saying. What do you say?', 'Scenario'),
  ('You''ve just started sharing your screen for a presentation. How do you quickly check that everyone can actually see it?', 'Scenario'),
  ('A colleague''s video keeps freezing and their voice is out of sync. How do you mention it naturally, then ask them to go over their idea again?', 'Scenario'),
  ('You got disconnected from a call for a moment. Now that you''re back, how do you explain that and ask what you missed?', 'Scenario'),

  ('You''re giving an update on a campaign, and so far it hasn''t really produced meaningful results. How do you say that honestly, without sounding negative?', 'Scenario'),
  ('In a planning meeting, you want to suggest starting with the easy wins before tackling the harder problems. How do you propose that?', 'Scenario'),
  ('You didn''t quite catch something a colleague said in a meeting, and you also want to add your own point. How do you handle both, politely?', 'Scenario'),

  ('You think your team''s current approach isn''t getting the results you hoped for, and you want to suggest a change in direction — without sounding like you''re criticizing your manager''s plan. What do you say?', 'Scenario'),
  ('You''ve been feeling stretched thin at work and want to let your manager know, without sounding like you''re complaining. How do you bring it up?', 'Scenario'),

  ('You emailed a vendor last week asking for updated pricing and still haven''t heard back, but you need the numbers before tomorrow''s budget meeting. How do you follow up, politely but with urgency?', 'Scenario'),

  -- Business: vocab/structure-in-context prompts from each session's word list
  ('What''s something you''ve been sticking with lately, even when it got difficult?', 'Business'),
  ('Tell me about something that turned out differently than you expected — at work or in daily life.', 'Business'),
  ('How do you usually stay consistent with a habit or routine?', 'Business'),
  ('Is there something that''s just not really your thing, no matter how many times people recommend it? Why not?', 'Business'),
  ('Tell me about some feedback or data you''ve received recently that changed how you think about something.', 'Business'),

  ('Tell me about something you''ve recently gotten really into.', 'Business'),
  ('What''s something you do to unwind after a stressful week?', 'Business'),

  ('Describe a time you had to pivot your approach on something, at work or in life.', 'Business'),
  ('Tell me about a time you needed to touch base with someone to check on progress.', 'Business'),

  ('Describe a situation where you had a lot of leverage — at work or elsewhere.', 'Business'),
  ('Tell me about a bottleneck you''ve dealt with — something that slowed down a process you were part of.', 'Business');
