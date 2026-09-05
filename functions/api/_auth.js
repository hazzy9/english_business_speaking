// Shared helper — not a route itself (no onRequest export), just imported
// by the endpoints below that need to gate writes behind the teacher password.

export function isTeacherAuthed(request, env) {
    const provided = request.headers.get('X-Teacher-Password') || '';
    const expected = env.TEACHER_PASSWORD || '';
    // Require a non-empty expected password so a misconfigured env doesn't
    // accidentally leave every write open.
    return expected.length > 0 && provided === expected;
  }
  
  export function unauthorized() {
    return Response.json({ error: 'Incorrect teacher password.' }, { status: 401 });
  }