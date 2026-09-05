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

// GET /api/submissions -> full history (for both pages) plus today's usage
export async function onRequestGet(context) {
  const db = context.env.DB;

  const { results } = await db
    .prepare(
      `SELECT submissions.*, questions.prompt as question_prompt, questions.category as question_category
       FROM submissions
       JOIN questions ON submissions.question_id = questions.id
       ORDER BY submissions.created_at DESC`
    )
    .all();

  const todayCount = await getTodayCount(db);
  const dailyLimit = await getDailyLimit(db);

  return Response.json({ submissions: results, todayCount, dailyLimit });
}

// POST /api/submissions  { questionId, transcript, aiFeedback }
// Called once the student has a transcript + AI feedback ready to save.
// This is the authoritative point where the daily limit is enforced —
// enforcing it here (not just in the frontend) means it can't be bypassed
// by calling the API directly.
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