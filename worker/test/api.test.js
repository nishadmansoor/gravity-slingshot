// API tests: a legit run works end to end, and forged requests are rejected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/index.js';
import { LEVELS } from '../src/levels.js';
import { RATE_LIMIT_MS, IDLE_EXPIRY_MS } from '../src/runs.js';
import { SOLUTIONS } from './solutions.js';
import { createFakeD1 as createDB } from './fakeD1.js';
import { simulateShot } from '../../shared/physics.js';
import { varyLevel, massFactors, NUDGE_RANGE } from '../src/variation.js';

const MISS = { angle: 180, power: 1, releaseTime: 0 }; // straight back out of bounds

// Most tests replay stored solutions, which assume the nominal masses, so they
// switch the hidden variation off. The variation tests below turn it on.
function setup({ variation = 'off' } = {}) {
  const env = { DB: createDB(), ALLOWED_ORIGINS: '*', VARIATION: variation };
  let clock = 1_000_000;
  const call = async (method, path, body) => {
    const req = new Request(`http://x${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const res = await handle(req, env, clock);
    return { status: res.status, body: await res.json() };
  };
  const tick = (ms = RATE_LIMIT_MS) => { clock += ms; };
  return { env, call, tick };
}

async function shoot(t, runId, levelId, launch) {
  t.tick();
  return t.call('POST', '/api/run/shot', { runId, levelId, launch });
}

test('full legit run clears all levels and scores server-side', async () => {
  const t = setup();
  const start = await t.call('POST', '/api/run/start');
  assert.equal(start.status, 200);
  assert.equal(start.body.level.id, LEVELS[0].id);
  let level = start.body.level;
  let expected = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    const r = await shoot(t, start.body.runId, level.id, SOLUTIONS[level.id]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.result, 'hit');
    expected += 500 + 50 * r.body.starsCollected.length;
    assert.equal(r.body.score, expected);
    level = r.body.nextLevel;
  }
  const fin = await t.call('POST', '/api/run/finish', { runId: start.body.runId, name: 'Ace' });
  assert.equal(fin.status, 200);
  assert.equal(fin.body.score, expected);
  const lb = await t.call('GET', '/api/leaderboard');
  assert.equal(lb.body.entries[0].name, 'Ace');
  assert.equal(lb.body.entries[0].score, expected);
});

test('level definitions are revealed only after clearing', async () => {
  const t = setup();
  const start = await t.call('POST', '/api/run/start');
  assert.equal(JSON.stringify(start.body).includes(LEVELS[1].id), false);
  const miss = await shoot(t, start.body.runId, LEVELS[0].id, MISS);
  assert.equal(miss.body.nextLevel, null);
});

test('rejects shots for a level not yet unlocked', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  const r = await shoot(t, body.runId, LEVELS[1].id, SOLUTIONS[LEVELS[1].id]);
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'level_locked');
});

test('rejects replaying an already-cleared level', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  await shoot(t, body.runId, LEVELS[0].id, SOLUTIONS[LEVELS[0].id]);
  const again = await shoot(t, body.runId, LEVELS[0].id, SOLUTIONS[LEVELS[0].id]);
  assert.equal(again.status, 403);
});

test('rejects shots faster than the rate limit', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  const a = await shoot(t, body.runId, LEVELS[0].id, MISS);
  assert.equal(a.status, 200);
  t.tick(RATE_LIMIT_MS - 1);
  const b = await t.call('POST', '/api/run/shot', { runId: body.runId, levelId: LEVELS[0].id, launch: MISS });
  assert.equal(b.status, 429);
  assert.equal(b.body.error, 'too_fast');
});

test('five misses end the run; a sixth shot is rejected', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  for (let i = 1; i <= 5; i++) {
    const r = await shoot(t, body.runId, LEVELS[0].id, MISS);
    assert.equal(r.body.shotsLeft, 5 - i);
  }
  const sixth = await shoot(t, body.runId, LEVELS[0].id, SOLUTIONS[LEVELS[0].id]);
  assert.equal(sixth.status, 409);
  assert.equal(sixth.body.error, 'run_ended');
});

test('rejects shots after the run finished', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  for (let i = 0; i < 5; i++) await shoot(t, body.runId, LEVELS[0].id, MISS);
  const fin = await t.call('POST', '/api/run/finish', { runId: body.runId, name: 'Loser' });
  assert.equal(fin.status, 200);
  assert.equal(fin.body.score, 0);
  const r = await shoot(t, body.runId, LEVELS[0].id, SOLUTIONS[LEVELS[0].id]);
  assert.equal(r.status, 409);
});

test('client-sent score, result, or cleared flags are ignored', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  t.tick();
  const r = await t.call('POST', '/api/run/shot', {
    runId: body.runId, levelId: LEVELS[0].id, launch: MISS,
    result: 'hit', score: 99999, levelCleared: true, path: [],
  });
  assert.equal(r.body.result, 'miss');
  assert.equal(r.body.score, 0);
  for (let i = 0; i < 4; i++) await shoot(t, body.runId, LEVELS[0].id, MISS);
  const fin = await t.call('POST', '/api/run/finish', { runId: body.runId, name: 'Cheater', score: 99999 });
  assert.equal(fin.body.score, 0);
});

test('cannot submit an active run or submit twice', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  const early = await t.call('POST', '/api/run/finish', { runId: body.runId, name: 'Early' });
  assert.equal(early.status, 409);
  for (let i = 0; i < 5; i++) await shoot(t, body.runId, LEVELS[0].id, MISS);
  assert.equal((await t.call('POST', '/api/run/finish', { runId: body.runId, name: 'Once' })).status, 200);
  assert.equal((await t.call('POST', '/api/run/finish', { runId: body.runId, name: 'Twice' })).status, 409);
});

test('rejects malformed input', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  const cases = [
    [{ runId: 'nope', levelId: LEVELS[0].id, launch: MISS }, 400],
    [{ runId: crypto.randomUUID(), levelId: LEVELS[0].id, launch: MISS }, 404],
    [{ runId: body.runId, levelId: LEVELS[0].id, launch: { angle: 'NaN', power: 1, releaseTime: 0 } }, 400],
    [{ runId: body.runId, levelId: LEVELS[0].id }, 400],
  ];
  for (const [payload, status] of cases) {
    t.tick();
    assert.equal((await t.call('POST', '/api/run/shot', payload)).status, status, JSON.stringify(payload));
  }
  assert.equal((await t.call('POST', '/api/run/shot', '{not json')).status, 400);
  assert.equal((await t.call('POST', '/api/run/shot', 'x'.repeat(5000))).status, 413);
  for (let i = 0; i < 5; i++) await shoot(t, body.runId, LEVELS[0].id, MISS);
  for (const name of ['ab', 'thisnameistoolong', '<script>']) {
    assert.equal((await t.call('POST', '/api/run/finish', { runId: body.runId, name })).status, 400);
  }
});

test('runs expire after 30 minutes idle', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  t.tick(IDLE_EXPIRY_MS + 1);
  const r = await t.call('POST', '/api/run/shot', { runId: body.runId, levelId: LEVELS[0].id, launch: MISS });
  assert.equal(r.status, 410);
});

test('concurrent duplicate shots apply only once', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  t.tick();
  const payload = { runId: body.runId, levelId: LEVELS[0].id, launch: MISS };
  const results = await Promise.all([1, 2, 3].map(() => t.call('POST', '/api/run/shot', payload)));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const row = t.env.DB._raw.prepare('SELECT shots_used FROM runs WHERE id = ?').get(body.runId);
  assert.equal(row.shots_used, 1);
});

test('ending a run early keeps its score and allows submitting', async () => {
  const t = setup();
  const { body } = await t.call('POST', '/api/run/start');
  await shoot(t, body.runId, LEVELS[0].id, SOLUTIONS[LEVELS[0].id]);
  const end = await t.call('POST', '/api/run/end', { runId: body.runId });
  assert.equal(end.status, 200);
  assert.equal(end.body.score, 500);
  const r = await shoot(t, body.runId, LEVELS[1].id, SOLUTIONS[LEVELS[1].id]);
  assert.equal(r.status, 409);
  const fin = await t.call('POST', '/api/run/finish', { runId: body.runId, name: 'Quitter' });
  assert.equal(fin.body.score, 500);
});

test('hidden variation: client sees nominal masses, never the seed', async () => {
  const t = setup({ variation: 'on' });
  const start = await t.call('POST', '/api/run/start');
  assert.deepEqual(start.body.level.bodies.map((b) => b.mass), LEVELS[0].bodies.map((b) => b.mass));
  assert.equal(JSON.stringify(start.body).includes('seed'), false);
  const shot = await shoot(t, start.body.runId, LEVELS[0].id, MISS);
  assert.equal(JSON.stringify(shot.body).includes('seed'), false);
});

test('hidden variation: the server simulates the run-specific level', async () => {
  const t = setup({ variation: 'on' });
  const { body } = await t.call('POST', '/api/run/start');
  const { seed } = t.env.DB._raw.prepare('SELECT seed FROM runs WHERE id = ?').get(body.runId);
  const launch = { angle: -30, power: 0.5, releaseTime: 0 };
  const r = await shoot(t, body.runId, LEVELS[0].id, launch);
  assert.deepEqual(r.body.path, simulateShot(varyLevel(LEVELS[0], seed), launch).path);
  assert.notDeepEqual(r.body.path, simulateShot(LEVELS[0], launch).path);
});

test('variation factors are deterministic and inside the nudge range', () => {
  for (const level of LEVELS) {
    for (const seed of [0, 1, 123456789, 4294967295]) {
      const f = massFactors(level, seed);
      assert.deepEqual(f, massFactors(level, seed));
      for (const k of f) {
        const d = Math.abs(k - 1);
        assert.ok(d >= NUDGE_RANGE.min - 1e-12 && d <= NUDGE_RANGE.max + 1e-12, `factor ${k}`);
      }
    }
  }
});
