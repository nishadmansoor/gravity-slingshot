// Cloudflare Worker entry: routing, JSON parsing, CORS, error mapping.
// Game logic lives in runs.js; physics in shared/physics.js.
import { ApiError, startRun, takeShot, endRun, finishRun, leaderboard } from './runs.js';

const MAX_BODY_BYTES = 2048; // real requests are ~150 bytes

// CORS is NOT a security boundary here (anyone can curl the API); it only
// lets the Pages-hosted client call a Worker on another origin. Security comes
// from the server computing every result itself.
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'body_too_large');
  try {
    const body = JSON.parse(text || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new ApiError(400, 'bad_json');
  }
}

// `now` is injectable so tests can control the clock (rate limit, expiry).
export async function handle(request, env, now = Date.now()) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const { pathname } = new URL(request.url);
  const route = `${request.method} ${pathname}`;
  try {
    switch (route) {
      case 'POST /api/run/start':
        return json(await startRun(env, now), 200, cors);
      case 'POST /api/run/shot':
        return json(await takeShot(env, await readJson(request), now), 200, cors);
      case 'POST /api/run/end':
        return json(await endRun(env, await readJson(request), now), 200, cors);
      case 'POST /api/run/finish':
        return json(await finishRun(env, await readJson(request), now), 200, cors);
      case 'GET /api/leaderboard':
        return json(await leaderboard(env), 200, cors);
      default:
        return json({ error: 'not_found' }, 404, cors);
    }
  } catch (err) {
    if (err instanceof ApiError) return json({ error: err.code, message: err.message }, err.status, cors);
    console.error(err);
    return json({ error: 'internal' }, 500, cors);
  }
}

export default {
  fetch(request, env) {
    // run_worker_first routes /api/* here; anything else that reaches the
    // Worker is a static asset (the built game).
    if (new URL(request.url).pathname.startsWith('/api/')) return handle(request, env);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};
