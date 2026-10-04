import { isTeacherAuthed, unauthorized } from './_auth.js';

// POST /api/generate-questions  { notes, requests: [{ category, count }] }  — teacher only
// Drafts practice questions with Workers AI, one request per category. Nothing
// is saved here: the teacher reviews the drafts and adds the ones they want
// through POST /api/questions. Teacher-only because every call costs money.

const MAX_PER_CATEGORY = 15;
const MAX_CATEGORIES = 8;
const MAX_NOTES_CHARS = 4000;
const EXAMPLES_IN_PROMPT = 60;

// What share of a category's new questions should draw on the teacher's lesson
// notes: 1 = all of them, 0.5 = half, 0 = none. Business and Scenario are
// built around the notes. Every other category (Daily, General, Opinion,
// Storytelling, ...) stays mostly everyday, but about a third of its questions
// are phrased so a natural answer uses a word or grammar point she has learned.
// Change a number here, or add a category name, to adjust.
const LESSON_SHARE = { Business: 1, Scenario: 1 };
const DEFAULT_LESSON_SHARE = 1 / 3;

// Two questions sharing this fraction of their words count as too similar.
const SIMILARITY_LIMIT = 0.6;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isTeacherAuthed(request, env)) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const notes = String(body.notes || '').trim().slice(0, MAX_NOTES_CHARS);

  const seen = new Set();
  const requests = [];
  for (const r of Array.isArray(body.requests) ? body.requests : []) {
    const category = String((r && r.category) || '').trim().slice(0, 40);
    const count = Math.min(MAX_PER_CATEGORY, Math.floor(Number(r && r.count)));
    if (!category || !(count >= 1) || seen.has(category)) continue;
    seen.add(category);
    requests.push({ category, count });
  }
  if (!requests.length) {
    return Response.json({ error: 'Choose at least one category.' }, { status: 400 });
  }

  // One AI request per category, all at once: each gets its own category's
  // examples, a failure in one doesn't lose the others, and the total wait is
  // about one request long.
  const results = await Promise.all(
    requests.slice(0, MAX_CATEGORIES).map((r) => draftForCategory(env, r.category, r.count, notes))
  );
  return Response.json({ results });
}

async function draftForCategory(env, category, count, notes) {
  try {
    // Every existing question in the category, answered or not, so new ones
    // can't repeat anything she has seen or anything still waiting in the pool.
    const { results: rows } = await env.DB
      .prepare('SELECT prompt FROM questions WHERE category = ? ORDER BY created_at DESC')
      .bind(category)
      .all();
    const existing = rows.map((r) => r.prompt);

    // Ask for extra: some drafts will be dropped as too similar, and we'd
    // rather trim a surplus than fall short.
    const askFor = count + Math.max(2, Math.ceil(count * 0.3));
    // How many questions should use the notes: none if there are no notes,
    // every one for a lesson-driven category, otherwise a share of the number
    // actually requested (at least one, so a small request never rounds down
    // to zero). Sized from `count`, not `askFor`, because the surplus we ask
    // for is everyday filler that gets trimmed first.
    const share = category in LESSON_SHARE ? LESSON_SHARE[category] : DEFAULT_LESSON_SHARE;
    let lessonCount = 0;
    if (notes && share >= 1) lessonCount = askFor;
    else if (notes && share > 0) lessonCount = Math.max(1, Math.round(count * share));

    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
      messages: [{ role: 'user', content: buildPrompt(category, existing.slice(0, EXAMPLES_IN_PROMPT), notes, askFor, lessonCount) }],
      max_tokens: Math.min(2000, 150 + askFor * 60),
      temperature: 0.9
    });

    const candidates = readQuestions(result);
    if (!candidates) {
      throw new Error('AI reply had no usable questions: ' + (replyText(result) || JSON.stringify(result)).slice(0, 1000));
    }

    return { category, requested: count, questions: pickDistinct(candidates, existing, count) };
  } catch (err) {
    console.error('generate-questions failed for', category, err && err.message ? err.message : err);
    return { category, requested: count, questions: [], error: "Couldn't draft this category. Try again." };
  }
}

// lessonCount = how many of the askFor questions should use the notes:
// all of them (lesson-driven category), some (everyday category), or none.
function buildPrompt(category, examples, notes, askFor, lessonCount) {
  const exampleList = examples.length
    ? examples.map((q) => `- ${q}`).join('\n')
    : '(none yet)';

  const everyday = 'Write varied, general questions on different topics from the examples, that give the student useful practice speaking about their own life and opinions.';
  let source;
  if (!lessonCount) {
    source = `Do not rely on any lesson material. ${everyday}`;
  } else if (lessonCount >= askFor) {
    source = `Lesson notes from the teacher:\n"""\n${notes}\n"""\nBuild every new question around ONE specific item from these notes (a vocabulary word or phrase, a grammar point, or a situation), using a different item for each question. Design each question so that a natural answer would likely use that item. For a vocabulary item, don't put the word in the question; ask about something where it fits naturally.`;
  } else {
    source = `The student recently learned the material below.\n"""\n${notes}\n"""\nThe FIRST ${lessonCount} questions you write must each be built around ONE specific word, phrase, or grammar point from that material (a different one each time). They should be everyday questions on a normal topic, designed so that a natural answer would likely use that item, without naming it in the question. Illustration only, do not reuse it: if the material taught "hectic", you might ask "What does a typical busy day look like for you?". The remaining ${askFor - lessonCount} questions must be ordinary everyday questions unrelated to the material. ${everyday} Never mention the material, the lesson, or "using a word" in any question.`;
  }

  return `You write speaking-practice questions for an adult Korean learner of English. The student answers each question out loud for about a minute.

Category: ${category}

Questions already in this category. Your new questions must NOT repeat or closely resemble any of them, in topic or in wording:
${exampleList}

${source}

Write exactly ${askFor} NEW questions for the category "${category}".
Rules:
- Match the tone, length, and format of the examples.
- Each question must differ from every example and from every other new question in topic, not just in wording.
- One or two sentences, under 30 words, natural spoken English, no numbering.
Return ONLY valid JSON, nothing else: {"questions": ["...", "..."]}`;
}

// The reply as text, whichever shape Workers AI used to hand it back.
function replyText(result) {
  if (result && typeof result.response === 'string') return result.response;
  const msg = result && result.choices && result.choices[0] && result.choices[0].message;
  return msg && typeof msg.content === 'string' ? msg.content : '';
}

// Workers AI sometimes hands back the reply as a string and sometimes as an
// already-parsed object, so accept both. Returns an array of strings, or null.
// If the JSON is broken, falls back to pulling the quoted questions out directly.
function readQuestions(result) {
  const text = replyText(result);
  let data = result && result.response;
  if (typeof data === 'string' || !data) data = text ? parseJson(text) : null;
  const list = Array.isArray(data) ? data : data && data.questions;
  if (Array.isArray(list)) return list.filter((q) => typeof q === 'string');
  return text ? salvageStrings(text) : null;
}

// The AI occasionally gets the list right but fumbles the very end: a missing
// closing brace, a doubled quote, or a reply cut off mid-sentence. In testing
// that wrecked about 1 reply in 15 even though every question in it was fine,
// so rather than reject the whole reply, collect each complete quoted string
// inside the list. Fragments that aren't real questions are dropped later by
// cleanQuestion (too short), and the teacher reviews every draft anyway.
function salvageStrings(text) {
  const open = text.indexOf('[');
  if (open === -1) return null;
  const strings = (text.slice(open).match(/"(?:[^"\\]|\\.)*"/g) || [])
    .map((literal) => { try { return JSON.parse(literal); } catch (err) { return null; } })
    .filter((s) => typeof s === 'string');
  return strings.length ? strings : null;
}

function parseJson(text) {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  const start = t.search(/[{[]/);
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch (err) {
    return null;
  }
}

function cleanQuestion(raw) {
  const q = String(raw)
    .trim()
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/^["“]+|["”]+$/g, '')
    .trim();
  return q.length >= 15 && q.length <= 300 ? q : '';
}

function wordSet(s) {
  return new Set(s.toLowerCase().match(/[a-z']{3,}/g) || []);
}

// Share of words in common (0 = nothing, 1 = identical wording).
function similarity(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
}

// The code-side guarantee behind "not too similar": the prompt asks the AI to
// vary its questions, but a small model drifts, so every draft is also checked
// against all existing questions and against the drafts already kept.
function pickDistinct(candidates, existing, count) {
  const pool = existing.map(wordSet);
  const kept = [];
  for (const raw of candidates) {
    const q = cleanQuestion(raw);
    if (!q) continue;
    const words = wordSet(q);
    if (pool.some((p) => similarity(words, p) >= SIMILARITY_LIMIT)) continue;
    pool.push(words);
    kept.push(q);
    if (kept.length === count) break;
  }
  return kept;
}
