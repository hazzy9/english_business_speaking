// POST /api/events  { eventType }
// Logs one interaction we want visibility into — not general analytics,
// just the handful of client-side-only actions that otherwise leave no
// trace in the database (the server never sees them any other way).
// Fire-and-forget from the client: a failure here should never be visible
// to her or block anything else.
const ALLOWED_EVENT_TYPES = new Set([
  'history_14day_opened',
  'new_feedback_expanded',
  'new_question_clicked'
]);

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const eventType = body.eventType;

  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return Response.json({ error: 'Unknown event type.' }, { status: 400 });
  }

  await env.DB.prepare('INSERT INTO events (event_type) VALUES (?)').bind(eventType).run();

  return Response.json({ ok: true });
}
