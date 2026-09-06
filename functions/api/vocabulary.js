import { isTeacherAuthed, unauthorized } from './_auth.js';

// GET /api/vocabulary -> every word saved from feedback so far
export async function onRequestGet(context) {
  const db = context.env.DB;
  const { results } = await db
    .prepare('SELECT * FROM vocabulary ORDER BY created_at DESC')
    .all();
  return Response.json({ vocabulary: results });
}

// DELETE /api/vocabulary?id=123  — teacher only
// Also removes the auto-created question, so it stops being served.
export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!isTeacherAuthed(request, env)) return unauthorized();

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing id.' }, { status: 400 });

  const db = env.DB;
  const row = await db.prepare('SELECT question_id FROM vocabulary WHERE id = ?').bind(id).first();

  await db.prepare('DELETE FROM vocabulary WHERE id = ?').bind(id).run();
  if (row && row.question_id) {
    await db.prepare('DELETE FROM questions WHERE id = ?').bind(row.question_id).run();
  }

  return Response.json({ ok: true });
}