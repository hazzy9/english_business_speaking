// GET /api/audio?key=...
// Streams a saved recording back from R2 so it can be played in an
// <audio> tag. Not password-gated — <audio src> requests can't attach
// custom headers, so a header-based check isn't possible here anyway.
// Keys are long and effectively unguessable (timestamp + random UUID),
// and this URL is never linked anywhere except inside the already-hidden
// teacher/student pages.
export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
  
    if (!key) {
      return new Response('Missing key.', { status: 400 });
    }
  
    const object = await env.AUDIO_BUCKET.get(key);
    if (!object) {
      return new Response('Not found.', { status: 404 });
    }
  
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'private, max-age=31536000');
  
    return new Response(object.body, { headers });
  }