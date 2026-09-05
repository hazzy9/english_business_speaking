// POST /api/transcribe  (multipart/form-data, field name "audio")
// Runs the recording through Workers AI Whisper and returns plain text.
// The audio itself is never written anywhere — it only exists in memory
// for the length of this request.
export async function onRequestPost(context) {
    const { request, env } = context;
  
    const formData = await request.formData().catch(() => null);
    const file = formData ? formData.get('audio') : null;
  
    if (!file) {
      return Response.json({ error: 'No audio file received.' }, { status: 400 });
    }
  
    const buffer = await file.arrayBuffer();
    const input = { audio: [...new Uint8Array(buffer)] };
  
    try {
      const result = await env.AI.run('@cf/openai/whisper', input);
      return Response.json({ text: (result.text || '').trim() });
    } catch (err) {
      return Response.json({ error: 'Transcription failed. Please try again.' }, { status: 500 });
    }
  }