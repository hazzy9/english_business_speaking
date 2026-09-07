// POST /api/feedback  { question, transcript }
// Runs the transcript through Workers AI Llama 3.1 and returns STRUCTURED
// feedback (not prose) so the frontend can render inline corrections,
// a filler-word count, and a fluency score.
export async function onRequestPost(context) {
    const { request, env } = context;
    const body = await request.json().catch(() => ({}));
    const transcript = (body.transcript || '').trim();
  
    if (!transcript) {
      return Response.json({ error: 'No transcript to give feedback on.' }, { status: 400 });
    }
  
    const prompt = `You are a brief, strict English checker for a Korean speaker learning English.
  
  Transcript: "${transcript}"
  
  Return ONLY valid JSON, no markdown formatting, no explanation, matching exactly this shape:
  {
    "corrections": [{"original": "exact wrong phrase copied from the transcript", "corrected": "fixed phrase"}],
    "wordChoices": [{"original": "exact word or phrase copied from the transcript", "better": "a better English word", "korean": "the Korean meaning, one or two words"}],
    "fillerWords": ["um", "like"],
    "fluencyScore": 4
  }
  
  Rules:
  - "original" text in every item must be copied character-for-character from the transcript so it can be found automatically — do not paraphrase it.
  - fillerWords should list each distinct filler word actually present (e.g. um, uh, like, you know) — empty array if none.
  - fluencyScore is an integer 1-5, where 5 is very fluent and natural for a spoken answer.
  - Only include real mistakes in corrections and wordChoices — empty arrays are fine.
  - Output nothing except the JSON object.`;
  
    try {
      const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400
      });
  
      const raw = (result.response || '').trim();
      const parsed = parseFeedbackJson(raw);
  
      return Response.json({ feedback: JSON.stringify(parsed) });
    } catch (err) {
      // Logged so it shows up in `wrangler pages deployment tail` or the
      // dashboard's real-time logs — the frontend only ever sees the generic
      // message below, but this line is what actually tells us why it failed.
      console.error('feedback.js AI.run failed:', err && err.message ? err.message : err);
      return Response.json(
        { error: 'Feedback generation failed. Please try again.', detail: err && err.message ? err.message : String(err) },
        { status: 500 }
      );
    }
  }
  
  // Defensive parsing: small models sometimes wrap JSON in ```json fences
  // despite instructions not to, or add a stray sentence. Strip common
  // wrappers and fall back to a safe empty shape (plus the raw text) rather
  // than ever throwing — a malformed response should degrade gracefully,
  // not break the save.
  function parseFeedbackJson(raw) {
    let text = raw.trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();
  
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }
  
    try {
      const obj = JSON.parse(text);
      return {
        corrections: Array.isArray(obj.corrections) ? obj.corrections : [],
        wordChoices: Array.isArray(obj.wordChoices) ? obj.wordChoices : [],
        fillerWords: Array.isArray(obj.fillerWords) ? obj.fillerWords : [],
        fluencyScore: Number.isInteger(obj.fluencyScore) ? obj.fluencyScore : null
      };
    } catch (err) {
      return { corrections: [], wordChoices: [], fillerWords: [], fluencyScore: null, raw };
    }
  }