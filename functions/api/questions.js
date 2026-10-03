import { isTeacherAuthed, unauthorized } from './_auth.js';

// "Answered" is derived from the submissions table each time rather than
// stored as a flag, so it can't drift out of sync: delete a submission and
// its question is unanswered again. The rows themselves are never deleted
// because her history and the category chart join submissions to questions.
const UNANSWERED =
  'NOT EXISTS (SELECT 1 FROM submissions WHERE submissions.question_id = questions.id)';
// What she can be served: switched on AND never answered.
const AVAILABLE = `active = 1 AND ${UNANSWERED}`;

// GET /api/questions            -> unanswered questions, for the teacher page to manage
// GET /api/questions?next=1     -> one question for the student page. Picks a
//                                   random category (equal chance each, so a
//                                   category with lots of questions doesn't
//                                   dominate), then the least-served question
//                                   within it — so she gets a mix of category
//                                   types across her daily questions. Questions
//                                   she has already answered are never served
//                                   again; 404 once none are left.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const db = env.DB;

  if (url.searchParams.get('next') === '1') {
    const lastIdRow = await db
      .prepare("SELECT value FROM settings WHERE key = 'last_question_id'")
      .first();
    const lastId = lastIdRow ? Number(lastIdRow.value) : 0;

    const categoryRows = await db.prepare(`SELECT DISTINCT category FROM questions WHERE ${AVAILABLE}`).all();
    if (!categoryRows.results.length) {
      return Response.json({ error: 'No unanswered questions left.' }, { status: 404 });
    }
    const category = categoryRows.results[Math.floor(Math.random() * categoryRows.results.length)].category;

    let question = await db
      .prepare(`SELECT * FROM questions WHERE category = ? AND ${AVAILABLE} AND id != ? ORDER BY times_served ASC, RANDOM() LIMIT 1`)
      .bind(category, lastId)
      .first();

    // Falls back to any available question in the category (handles a category with only one left)
    if (!question) {
      question = await db
        .prepare(`SELECT * FROM questions WHERE category = ? AND ${AVAILABLE} ORDER BY times_served ASC, RANDOM() LIMIT 1`)
        .bind(category)
        .first();
    }

    if (!question) {
      return Response.json({ error: 'No unanswered questions left.' }, { status: 404 });
    }

    await db
      .prepare(
        "INSERT INTO settings (key, value) VALUES ('last_question_id', ?) " +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .bind(String(question.id))
      .run();

    // Bumping this here (not on submit) means "asked" counts as served the
    // moment she sees it, so the rotation stays fair even if she skips one.
    await db
      .prepare('UPDATE questions SET times_served = times_served + 1, last_served_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(question.id)
      .run();

    return Response.json({ question });
  }

  // Teacher's list: answered questions are hidden (they're spent), not deleted.
  const { results } = await db
    .prepare(`SELECT * FROM questions WHERE ${UNANSWERED} ORDER BY category, created_at DESC`)
    .all();

  return Response.json({ questions: results });
}

// POST /api/questions  { prompt, category }  — teacher only
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isTeacherAuthed(request, env)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const prompt = (body.prompt || '').trim();
  const category = (body.category || 'General').trim();

  if (!prompt) {
    return Response.json({ error: 'A question prompt is required.' }, { status: 400 });
  }

  await env.DB.prepare('INSERT INTO questions (prompt, category) VALUES (?, ?)')
    .bind(prompt, category)
    .run();

  return Response.json({ ok: true });
}

// PUT /api/questions  { id, prompt, category }  — teacher only
export async function onRequestPut(context) {
  const { request, env } = context;
  if (!isTeacherAuthed(request, env)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const id = body.id;
  const prompt = (body.prompt || '').trim();
  const category = (body.category || 'General').trim();

  if (!id) return Response.json({ error: 'Missing id.' }, { status: 400 });
  if (!prompt) return Response.json({ error: 'A question prompt is required.' }, { status: 400 });

  await env.DB.prepare('UPDATE questions SET prompt = ?, category = ? WHERE id = ?')
    .bind(prompt, category, id)
    .run();

  return Response.json({ ok: true });
}

// DELETE /api/questions?id=123  — teacher only
// DELETE /api/questions?id=123  — teacher only
export async function onRequestDelete(context) {
    const { request, env } = context;
    if (!isTeacherAuthed(request, env)) return unauthorized();
  
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id.' }, { status: 400 });
  
    const db = env.DB;
  
    // 1. Delete all student practice submissions recorded for this question
    await db.prepare('DELETE FROM submissions WHERE question_id = ?').bind(id).run();

    // 2. Delete the question itself
    await db.prepare('DELETE FROM questions WHERE id = ?').bind(id).run();
  
    return Response.json({ ok: true });
  }