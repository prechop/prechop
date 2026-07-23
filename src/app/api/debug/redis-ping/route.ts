export async function GET() {
  try {
    const start = Date.now();
    await redisUpdateKeyString("debug:ping", "ok", true, 10);
    const value = await redisRetrieveKeyString("debug:ping");
    return Response.json({ ok: true, value, ms: Date.now() - start });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
