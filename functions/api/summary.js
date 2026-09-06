import { isTeacherAuthed, unauthorized } from './_auth.js';

// POST /api/summary  { days? }  — teacher only, generated on demand (not scheduled)
// Pulls recent sessions' structured feedback and asks the model to spot
// recurring patterns — e.g. "mixed up articles in 4 of 6 sessions" — rather
// than the teacher having to read every transcript individually.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isTeacherAuthed(request, env)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const days = Number(body.days) > 0 ? Number(body.days) : 7;
  const db = env.DB;

  const { results } = await db
    .prepare(
      `SELECT ai_feedback, created_at FROM submissions
       WHERE created_at >= datetime('now', ?)
       ORDER BY created_at DESC`
    )
    .bind(`-${days} days`)
    .all();

  if (results.length === 0) {
    return Response.json({
      summary: `No practice sessions in the last ${days} days yet.`,
      sessionCount: 0,
      avgFluency: null
    });
  }

  const allCorrections = [];
  const allFillerWords = [];
  const fluencyScores = [];

  results.forEach((row) => {
    try {
      const fb = JSON.parse(row.ai_feedback);
      if (Array.isArray(fb.corrections)) {
        fb.corrections.forEach((c) => allCorrections.push(`"${c.original}" -> "${c.corrected}"`));
      }
      if (Array.isArray(fb.fillerWords)) {
        allFillerWords.push(...fb.fillerWords);
      }
      if (Number.isInteger(fb.fluencyScore)) {
        fluencyScores.push(fb.fluencyScore);
      }
    } catch (err) {
      // legacy plain-text feedback or a malformed entry — skip it for the pattern summary
    }
  });

  const avgFluency = fluencyScores.length
    ? Math.round((fluencyScores.reduce((a, b) => a + b, 0) / fluencyScores.length) * 10) / 10
    : null;

  const prompt = `Here is grammar-correction data from a Korean student's last ${results.length} spoken English practice sessions (past ${days} days):

Corrections made:
${allCorrections.length ? allCorrections.join('\n') : '(none)'}

Filler words used: ${allFillerWords.length ? allFillerWords.join(', ') : '(none)'}

In 2-3 short sentences, summarize the most common RECURRING patterns for her teacher — e.g. a specific grammar point she keeps missing (articles, verb tense, prepositions, etc.), not a list of every individual correction. Be specific and useful for lesson planning. If there's no clear pattern, say so briefly. Plain text only, no markdown.`;

  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200
    });

    return Response.json({
      summary: (result.response || '').trim(),
      sessionCount: results.length,
      avgFluency
    });
  } catch (err) {
    return Response.json({ error: 'Summary generation failed. Please try again.' }, { status: 500 });
  }
}