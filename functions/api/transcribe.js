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
    const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: arrayBufferToBase64(buffer),
      vad_filter: true,
      condition_on_previous_text: false
    });

    let audioKey = null;
    if (saveAudio) {
      const ext = extensionForMimeType(file.type);
      audioKey = `audio/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      await env.AUDIO_BUCKET.put(audioKey, buffer, {
        httpMetadata: { contentType: file.type || 'audio/webm' }
      });
    }

    return Response.json({ text: (result.text || '').trim(), audioKey });
  } catch (err) {
    return Response.json({ error: 'Transcription failed. Please try again.' }, { status: 500 });
  }
}

// btoa/String.fromCharCode only accept a bounded number of arguments, so a
// large recording has to be base64-encoded in chunks rather than spread in
// one call (which throws "Maximum call stack size exceeded" on big files).
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function extensionForMimeType(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}
