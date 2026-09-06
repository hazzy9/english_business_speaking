import { isTeacherAuthed, unauthorized } from './_auth.js';

// GET /api/questions            -> full list, for the teacher page to manage
// GET /api/questions?next=1     -> one question from the active category,
//                                   preferring whichever have been served
//                                   least (so nothing repeats until the
//                                   whole category has come up at least once).
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const db = env.DB;

  if (url.searchParams.get('next') === '1') {
    const activeCategoryRow = await db
      .prepare("SELECT value FROM settings WHERE key = 'active_category'")
      .first();
    const lastIdRow = await db
      .prepare("SELECT value FROM settings WHERE key = 'last_question_id'")
      .first();

    const category = activeCategoryRow ? activeCategoryRow.value : 'General';
    const lastId = lastIdRow ? Number(lastIdRow.value) : 0;

    let question = await db
      .prepare('SELECT * FROM questions WHERE category = ? AND id != ? ORDER BY times_served ASC, RANDOM() LIMIT 1')
      .bind(category, lastId)
      .first();

    // Falls back to any question in the category (handles a category with only one question)
    if (!question) {
      question = await db
        .prepare('SELECT * FROM questions WHERE category = ? ORDER BY times_served ASC, RANDOM() LIMIT 1')
        .bind(category)
        .first();
    }

    if (!question) {
      return Response.json(
        { error: `No questions yet in the "${category}" category.` },
        { status: 404 }
      );
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

  const { results } = await db
    .prepare('SELECT * FROM questions ORDER BY category, created_at DESC')
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

// DELETE /api/questions?id=123  — teacher only
export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!isTeacherAuthed(request, env)) return unauthorized();

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing id.' }, { status: 400 });

  await env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(id).run();
  return Response.json({ ok: true });
}