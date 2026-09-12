// POST /api/transcribe  (multipart/form-data)
// Fields: "audio" (the recording), "saveAudio" ("1" or "0")
// Always transcribes via Workers AI Whisper. Only uploads the audio to R2
// for permanent storage if saveAudio is "1" — the checkbox on the student
// page defaults to checked, but can be unticked (e.g. while testing) so
// nothing gets permanently kept for that session.
export async function onRequestPost(context) {
  const { request, env } = context;

  const formData = await request.formData().catch(() => null);
  const file = formData ? formData.get('audio') : null;
  const saveAudio = formData ? formData.get('saveAudio') === '1' : false;

  if (!file) {
    return Response.json({ error: 'No audio file received.' }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();

  try {
    let audioKey = null;

    if (saveAudio) {
      const ext = extensionForMimeType(file.type);
      audioKey = `audio/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      const [result] = await Promise.all([
        env.AI.run('@cf/openai/whisper', { audio: [...new Uint8Array(buffer)] }),
        env.AUDIO_BUCKET.put(audioKey, buffer, {
          httpMetadata: { contentType: file.type || 'audio/webm' }
        })
      ]);
      return Response.json({ text: (result.text || '').trim(), audioKey });
    }

    const result = await env.AI.run('@cf/openai/whisper', { audio: [...new Uint8Array(buffer)] });
    return Response.json({ text: (result.text || '').trim(), audioKey: null });
  } catch (err) {
    console.error('transcribe.js failed:', err && err.message ? err.message : err);
    return Response.json({ error: 'Transcription failed. Please try again.' }, { status: 500 });
  }
}

function extensionForMimeType(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}
