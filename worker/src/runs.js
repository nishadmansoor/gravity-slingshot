// Run lifecycle: start → shots → finish. This is where the anti-cheat lives.
//
// The rule is simple: the client only ever sends *inputs* (a launch). Every
// outcome — hit/crash/miss, stars, points, which level is unlocked, the final
// score — is computed here from data the client can't touch.
import { CONFIG, simulateShot, quantizeLaunch, levelPoints } from '../../shared/physics.js';
import { LEVELS, publicLevel } from './levels.js';
import { varyLevel, newSeed } from './variation.js';

export const RATE_LIMIT_MS = 1500;          // min gap between shots in one run
export const IDLE_EXPIRY_MS = 30 * 60 * 1000; // runs die after 30 min idle
const NAME_RE = /^[A-Za-z0-9 _-]{3,12}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export async function startRun(env, now) {
  // randomUUID is unguessable, so one player can't act on another's run.
  const id = crypto.randomUUID();
  // The seed never leaves the server; it secretly varies body masses.
  await env.DB.prepare('INSERT INTO runs (id, seed, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .bind(id, newSeed(), now, now).run();
  return {
    runId: id,
    level: publicLevel(0),
    levelCount: LEVELS.length,
    shotsPerLevel: CONFIG.SHOTS_PER_LEVEL,
    rateLimitMs: RATE_LIMIT_MS,
  };
}

async function loadRun(env, runId, now) {
  if (typeof runId !== 'string' || !UUID_RE.test(runId)) throw new ApiError(400, 'bad_run_id');
  const run = await env.DB.prepare('SELECT * FROM runs WHERE id = ?').bind(runId).first();
  if (!run) throw new ApiError(404, 'run_not_found');
  if (run.status === 'expired') throw new ApiError(410, 'run_expired');
  if (now - run.updated_at > IDLE_EXPIRY_MS) {
    // Expire lazily on next touch instead of running a cron job.
    await env.DB.prepare("UPDATE runs SET status = 'expired', version = version + 1 WHERE id = ?")
      .bind(runId).run();
    throw new ApiError(410, 'run_expired');
  }
  return run;
}

export async function takeShot(env, body, now) {
  const run = await loadRun(env, body?.runId, now);

  // Reject everything a forged request might try, cheapest checks first.
  if (run.status !== 'active') throw new ApiError(409, 'run_ended');
  const level = LEVELS[run.level_index];
  // Only the current level is playable: no skipping ahead, no replaying an
  // easy level that's already cleared.
  if (body.levelId !== level.id) throw new ApiError(403, 'level_locked');
  if (run.shots_used >= CONFIG.SHOTS_PER_LEVEL) throw new ApiError(409, 'no_shots_left');
  // Rate limit stops brute-forcing the server as an oracle at machine speed.
  if (now - run.last_shot_at < RATE_LIMIT_MS) throw new ApiError(429, 'too_fast');
  const launch = quantizeLaunch(body.launch);
  if (!launch) throw new ApiError(400, 'bad_launch');

  // The authoritative simulation, against this run's hidden variant of the
  // level. VARIATION=off exists only so tests can use stored solutions.
  const actual = env.VARIATION === 'off' ? level : varyLevel(level, run.seed);
  const sim = simulateShot(actual, launch);

  const shotNo = run.shots_used + 1;
  const next = { ...run };
  let points = 0;
  let stars = 0;
  if (sim.result === 'hit') {
    stars = sim.starsCollected.length; // stars only count on the clearing shot
    points = levelPoints(shotNo, stars);
    next.score += points;
    next.levels_cleared += 1;
    next.level_index += 1;
    next.shots_used = 0;
    if (next.level_index >= LEVELS.length) next.status = 'complete';
  } else {
    next.shots_used = shotNo;
    if (shotNo >= CONFIG.SHOTS_PER_LEVEL) next.status = 'over';
  }

  // Optimistic concurrency: the WHERE on version means if two requests raced
  // past the checks above, only the first write lands and the second gets 0
  // changes. That also makes the rate limit race-proof.
  const res = await env.DB.prepare(
    `UPDATE runs SET status = ?, level_index = ?, shots_used = ?, score = ?, levels_cleared = ?,
       version = version + 1, updated_at = ?, last_shot_at = ?
     WHERE id = ? AND version = ?`,
  ).bind(next.status, next.level_index, next.shots_used, next.score, next.levels_cleared,
    now, now, run.id, run.version).run();
  if (!res.meta || res.meta.changes !== 1) throw new ApiError(409, 'conflict');

  await env.DB.prepare(
    `INSERT INTO shots (run_id, level_id, shot_no, angle_deci, power_centi, release_step, result, stars, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(run.id, level.id, shotNo, launch.angleDeci, launch.powerCenti, launch.releaseStep,
    sim.result, stars, now).run();

  const cleared = sim.result === 'hit';
  return {
    result: sim.result,
    path: sim.path,
    sampleEvery: CONFIG.PATH_SAMPLE_EVERY,
    steps: sim.steps,
    launch,
    starsCollected: sim.starsCollected,
    shotNo,
    shotsLeft: cleared ? CONFIG.SHOTS_PER_LEVEL : CONFIG.SHOTS_PER_LEVEL - shotNo,
    levelCleared: cleared,
    points,
    score: next.score,
    levelsCleared: next.levels_cleared,
    status: next.status,
    // The next level is revealed only now, after the server saw it cleared.
    nextLevel: cleared && next.status === 'active' ? publicLevel(next.level_index) : null,
  };
}

// Player chose to stop early: lock in the score so far so it can be
// submitted. No advantage over running out of shots, it just doesn't throw
// the run away.
export async function endRun(env, body, now) {
  const run = await loadRun(env, body?.runId, now);
  if (run.status === 'active') {
    const res = await env.DB.prepare(
      "UPDATE runs SET status = 'over', version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
    ).bind(now, run.id, run.version).run();
    if (!res.meta || res.meta.changes !== 1) throw new ApiError(409, 'conflict');
    run.status = 'over';
  }
  return { status: run.status, score: run.score, levelsCleared: run.levels_cleared };
}

export async function finishRun(env, body, now) {
  const run = await loadRun(env, body?.runId, now);
  if (run.status === 'active') throw new ApiError(409, 'run_active');
  if (run.submitted) throw new ApiError(409, 'already_submitted');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!NAME_RE.test(name)) throw new ApiError(400, 'bad_name', 'Name must be 3–12 letters, digits, spaces, _ or -');

  // Claim the submission atomically so a double-click can't post twice.
  const res = await env.DB.prepare(
    'UPDATE runs SET submitted = 1, version = version + 1, updated_at = ? WHERE id = ? AND submitted = 0',
  ).bind(now, run.id).run();
  if (!res.meta || res.meta.changes !== 1) throw new ApiError(409, 'already_submitted');

  // The score comes from the runs row, never from the request body.
  await env.DB.prepare(
    'INSERT INTO leaderboard (run_id, name, score, levels_cleared, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(run.id, name, run.score, run.levels_cleared, now).run();
  const better = await env.DB.prepare('SELECT COUNT(*) AS n FROM leaderboard WHERE score > ?')
    .bind(run.score).first();
  return { name, score: run.score, levelsCleared: run.levels_cleared, rank: (better?.n ?? 0) + 1 };
}

export async function leaderboard(env) {
  const { results } = await env.DB.prepare(
    'SELECT name, score, levels_cleared AS levelsCleared, created_at AS createdAt FROM leaderboard ORDER BY score DESC, created_at ASC LIMIT 20',
  ).all();
  return { entries: results };
}
