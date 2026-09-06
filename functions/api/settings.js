import { isTeacherAuthed, unauthorized } from './_auth.js';

// GET /api/settings -> daily limit, and the list of categories that exist
// (derived from the questions table) so the teacher page can show what's
// there. Categories no longer need an "active" one — questions are now
// randomly drawn across all of them, see functions/api/questions.js.
export async function onRequestGet(context) {
  const db = context.env.DB;

  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows.results) settings[row.key] = row.value;

  const categoriesResult = await db
    .prepare('SELECT DISTINCT category FROM questions ORDER BY category')
    .all();
  const categories = categoriesResult.results.map((r) => r.category);

  return Response.json({
    dailyLimit: Number(settings.daily_limit || 3),
    categories
  });
}

// POST /api/settings  { dailyLimit }  — teacher only
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isTeacherAuthed(request, env)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const db = env.DB;

  if (body.dailyLimit !== undefined && body.dailyLimit !== null && body.dailyLimit !== '') {
    await db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('daily_limit', ?) " +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .bind(String(body.dailyLimit))
      .run();
  }

  return Response.json({ ok: true });
}