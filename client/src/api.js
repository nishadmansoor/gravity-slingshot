// Every call to the Worker. The client sends only inputs (a launch, a name)
// and gets back results computed on the server.
const BASE = import.meta.env.VITE_API_BASE || ''; // '' → same origin / Vite proxy

export class ApiError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'error', data.message);
  return data;
}

export const api = {
  startRun: () => call('POST', '/api/run/start'),
  shot: (runId, levelId, launch) => call('POST', '/api/run/shot', { runId, levelId, launch }),
  endRun: (runId) => call('POST', '/api/run/end', { runId }),
  finish: (runId, name) => call('POST', '/api/run/finish', { runId, name }),
  leaderboard: () => call('GET', '/api/leaderboard'),
};
