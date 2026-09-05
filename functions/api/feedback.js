// POST /api/feedback  { question, transcript }
// Runs the transcript through Workers AI Llama 3.1 and returns coaching feedback.
export async function onRequestPost(context) {
    const { request, env } = context;
    const body = await request.json().catch(() => ({}));
    const question = body.question || '';
    const transcript = (body.transcript || '').trim();
  
    if (!transcript) {
      return Response.json({ error: 'No transcript to give feedback on.' }, { status: 400 });
    }
  
    const prompt = `You are a warm, encouraging English speaking coach for a language learner.
  
  The student was asked this freestyle speaking question: "${question}"
  
  Here is the transcript of their spoken answer:
  "${transcript}"
  
  Write short, encouraging feedback directly to the student (use "you"). Cover, briefly:
  1. What they did well (content and ideas)
  2. Two or three specific grammar or word-choice corrections, if needed (quote the phrase and the fix)
  3. One suggestion to sound more natural or fluent
  
  Keep it under 150 words, warm in tone, and easy to read. No markdown headers — short lines or a few bullet points only.`;
  
    try {
      const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }]
      });
      return Response.json({ feedback: (result.response || '').trim() });
    } catch (err) {
      return Response.json({ error: 'Feedback generation failed. Please try again.' }, { status: 500 });
    }
  }