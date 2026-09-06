import { isTeacherAuthed, unauthorized } from './_auth.js';

// Shifts the UTC clock D1 uses so "today" lines up with the student and
// teacher's local day instead of resetting at UTC midnight.
// Seoul is UTC+9 — change this if either of you is ever in a different zone.
const TZ_OFFSET = '+9 hours';

async function getTodayCount(db) {
  const row = await db
    .prepare(
      "SELECT COUNT(*) as count FROM submissions WHERE date(created_at, ?) = date('now', ?)"
    )
    .bind(TZ_OFFSET, TZ_OFFSET)
    .first();
  return row ? row.count : 0;
}

async function getDailyLimit(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'daily_limit'").first();
  return row ? Number(row.value) : 3;
}

// Saves any new word-choice suggestions from this session's feedback into
// the vocabulary table, and auto-creates a real "Use the word ... in a
// sentence" question in the Vocabulary category for each new one — so it
// naturally comes back around through the normal question rotation later.
// Best-effort: failures here never block saving the submission itself.
async function saveVocabulary(db, aiFeedback) {
  let parsed;
  try {
    parsed = JSON.parse(aiFeedback);
  } catch (err) {
    return;
  }
  const wordChoices = Array.isArray(parsed.wordChoices) ? parsed.wordChoices : [];
  if (wordChoices.length === 0) return;

  const seen = new Set();
  for (const wc of wordChoices) {
    const word = (wc.better || '').trim();
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());

    try {
      const existing = await db
        .prepare('SELECT id FROM vocabulary WHERE word = ? COLLATE NOCASE')
        .bind(word)
        .first();
      if (existing) continue;

      const korean = (wc.korean || '').trim();
      const prompt = korean
        ? `Use the word "${word}" (${korean}) in a sentence.`
        : `Use the word "${word}" in a sentence.`;

      const qResult = await db
        .prepare('INSERT INTO questions (prompt, category) VALUES (?, ?)')
        .bind(prompt, 'Vocabulary')
        .run();

      await db
        .prepare('INSERT INTO vocabulary (word, korean, question_id) VALUES (?, ?, ?)')
        .bind(word, korean, qResult.meta.last_row_id)
        .run();
    } catch (err) {
      // skip this word, keep going — never let a vocabulary hiccup fail the submission
    }
  }
}

// GET /api/submissions             -> full history (teacher page)
// GET /api/submissions?scope=today -> only today's submissions (student's main view)
// GET /api/submissions?scope=week  -> last 7 days (student's "My records" view)
export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope');

  const baseQuery = `SELECT submissions.*, questions.prompt as question_prompt, questions.category as question_category
       FROM submissions
       JOIN questions ON submissions.question_id = questions.id`;

  let results;
  if (scope === 'today') {
    const row = await db
      .prepare(`${baseQuery} WHERE date(submissions.created_at, ?) = date('now', ?) ORDER BY submissions.created_at DESC`)
      .bind(TZ_OFFSET, TZ_OFFSET)
      .all();
    results = row.results;
  } else if (scope === 'week') {
    const row = await db
      .prepare(`${baseQuery} WHERE submissions.created_at >= datetime('now', '-7 days') ORDER BY submissions.created_at DESC`)
      .all();
    results = row.results;
  } else {
    const row = await db.prepare(`${baseQuery} ORDER BY submissions.created_at DESC`).all();
    results = row.results;
  }

  const todayCount = await getTodayCount(db);
  const dailyLimit = await getDailyLimit(db);

  return Response.json({ submissions: results, todayCount, dailyLimit });
}

// DELETE /api/submissions  — teacher only. Clears today's answers and
// resets today's count, freeing up the daily limit again. Yesterday's (and
// earlier) submissions are untouched — this only ever affects "today" by
// the same local-time definition used everywhere else in this file.
export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!isTeacherAuthed(request, env)) return unauthorized();

  const db = env.DB;
  await db
    .prepare("DELETE FROM submissions WHERE date(created_at, ?) = date('now', ?)")
    .bind(TZ_OFFSET, TZ_OFFSET)
    .run();

  return Response.json({ ok: true });
}

// POST /api/submissions  { questionId, transcript, aiFeedback }
// aiFeedback is a JSON string: {corrections, wordChoices, fillerWords, fluencyScore}
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;
  const body = await request.json().catch(() => ({}));
  const { questionId, transcript, aiFeedback } = body;

  if (!questionId || !transcript) {
    return Response.json({ error: 'Missing questionId or transcript.' }, { status: 400 });
  }

  const todayCount = await getTodayCount(db);
  const dailyLimit = await getDailyLimit(db);

  if (todayCount >= dailyLimit) {
    return Response.json(
      { error: "Today's question limit has been reached.", todayCount, dailyLimit },
      { status: 429 }
    );
  }

  const result = await db
    .prepare('INSERT INTO submissions (question_id, transcript, ai_feedback) VALUES (?, ?, ?)')
    .bind(questionId, transcript, aiFeedback || '')
    .run();

  if (aiFeedback) {
    await saveVocabulary(db, aiFeedback);
  }

  return Response.json({
    ok: true,
    id: result.meta.last_row_id,
    todayCount: todayCount + 1,
    dailyLimit
  });
}

// PUT /api/submissions  { id, teacherFeedback }  — teacher only
export async function onRequestPut(context) {
  const { request, env } = context;
  if (!isTeacherAuthed(request, env)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const { id, teacherFeedback } = body;
  if (!id) return Response.json({ error: 'Missing id.' }, { status: 400 });

  await env.DB.prepare(
    "UPDATE submissions SET teacher_feedback = ?, status = 'reviewed' WHERE id = ?"
  )
    .bind(teacherFeedback || '', id)
    .run();

  return Response.json({ ok: true });
}