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
  - List at most 6 corrections and 4 word choices — pick the most useful ones, not every possible issue. This keeps the JSON short enough to always finish.
  - Output nothing except the JSON object.`;

    try {
      // Small models slip on JSON syntax in roughly one reply in thirty (a
      // stray comma, a missing brace). The reader below repairs most of those;
      // asking a second time covers the rest, so a visible failure is rare.
      let parsed = null;
      for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
        const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 700
        });

        // Defensive: don't assume the result shape. Different Workers AI model
        // variants have returned result.response as something other than a
        // plain string in testing, which crashed .trim(). Handle every case
        // without throwing, and log the unexpected shape so it can be fixed
        // properly rather than guessed at again.
        let raw;
        if (typeof result === 'string') {
          raw = result;
        } else if (result && typeof result.response === 'string') {
          raw = result.response;
        } else {
          console.error('feedback.js unexpected AI.run result shape:', JSON.stringify(result));
          raw = result && result.response != null ? JSON.stringify(result.response) : JSON.stringify(result || {});
        }
        raw = raw.trim();

        parsed = parseFeedbackJson(raw);
        if (!parsed) console.error(`feedback.js could not parse model JSON (attempt ${attempt}):`, raw);
      }

      if (!parsed) {
        // Both attempts were unusable. Never surface broken text as if it
        // were real feedback; treat it as a failed request so the frontend
        // shows its existing "couldn't generate feedback" message instead.
        return Response.json({ error: 'Feedback generation failed. Please try again.' }, { status: 502 });
      }
      return Response.json({ feedback: JSON.stringify(parsed) });
    } catch (err) {
      console.error('feedback.js AI.run failed:', err && err.message ? err.message : err);
      return Response.json(
        { error: 'Feedback generation failed. Please try again.', detail: err && err.message ? err.message : String(err) },
        { status: 500 }
      );
    }
  }
  
  // Defensive parsing: small models sometimes wrap JSON in ```json fences
  // despite instructions not to, or add a stray sentence. Strip common
  // wrappers, then try the text as-is and then a repaired copy. Returns null
  // (never the broken raw text) if neither is valid JSON; the caller retries
  // and, failing that, treats it as a failed request.
  function parseFeedbackJson(raw) {
    let text = raw.trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();

    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return null;
    const lastBrace = text.lastIndexOf('}');

    const candidates = [];
    if (lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));
    candidates.push(repairJson(text.slice(firstBrace)));

    for (const candidate of candidates) {
      try {
        const obj = JSON.parse(candidate);
        return {
          corrections: Array.isArray(obj.corrections) ? obj.corrections : [],
          wordChoices: Array.isArray(obj.wordChoices) ? obj.wordChoices : [],
          fillerWords: Array.isArray(obj.fillerWords) ? obj.fillerWords : [],
          fluencyScore: Number.isInteger(obj.fluencyScore) ? obj.fluencyScore : null
        };
      } catch (err) { /* try the next candidate */ }
    }
    return null;
  }

  // Fixes the usual slips in an otherwise good reply: a trailing comma before
  // a closing bracket (seen in testing), a reply cut off mid-way, brackets
  // left open, a key with no value. Walks the text tracking what is still
  // open (ignoring brackets inside quoted strings), then closes it.
  function repairJson(text) {
    let t = text.replace(/,\s*([\]}])/g, '$1');
    const closers = [];
    let inString = false;
    let escaped = false;
    for (const ch of t) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') closers.push('}');
      else if (ch === '[') closers.push(']');
      else if (ch === '}' || ch === ']') closers.pop();
    }
    if (inString) t += '"';
    t = t.replace(/,\s*$/, '').replace(/,?\s*"[^"]*"\s*:\s*$/, '');
    return t + closers.reverse().join('');
  }
