// Deterministic 2D gravity simulation shared by the client (aim preview only)
// and the Worker (the authoritative result of every shot).
//
// Why determinism matters: the server re-simulates every shot from the raw
// launch inputs. If the simulation depended on frame timing, Math.random, or
// accumulated state, the server and client could disagree, and worse, the
// server could not be the single source of truth. Everything below is a pure
// function of (level, quantized launch).

export const CONFIG = Object.freeze({
  DT: 1 / 120,              // fixed timestep (s). Never use frame delta.
  MAX_STEPS: 120 * 20,      // 20 simulated seconds, then it's a miss
  G: 1,                     // gravitational constant (masses are tuned to it)
  MIN_D: 0.6,               // softening distance: caps acceleration near centers
  PROBE_RADIUS: 0.2,
  MAX_SPEED: 16,            // launch speed at power = 1 (units/s)
  MIN_POWER: 0.1,           // a zero-speed shot is pointless; clamp up
  SHOTS_PER_LEVEL: 5,
  STAR_POINTS: 50,
  PATH_SAMPLE_EVERY: 4,     // keep 1 of every N steps in the returned path
  PREVIEW_FRACTION: 0.15,   // client may show only this fraction of a path
  MAX_RELEASE_STEP: 120 * 60 * 30, // 30 min of level clock; bounds the input
});

const TAU = Math.PI * 2;

// Quantize raw inputs to a small, discrete set. Both sides do this before
// simulating, so tiny float differences in how the client measured a drag
// can't produce different results, and the server stores exact integers.
// Returns null for anything that isn't a finite number (forged requests).
export function quantizeLaunch(launch) {
  if (!launch || typeof launch !== 'object') return null;
  const { angle, power, releaseTime } = launch;
  if (![angle, power, releaseTime].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return null;
  }
  // angle in degrees → integer tenths of a degree in [0, 3600)
  let angleDeci = Math.round(angle * 10) % 3600;
  if (angleDeci < 0) angleDeci += 3600;
  // power in [0, 1] → integer hundredths, clamped
  const powerCenti = Math.min(100, Math.max(CONFIG.MIN_POWER * 100, Math.round(power * 100)));
  // releaseTime in seconds → whole simulation steps, clamped
  const releaseStep = Math.min(CONFIG.MAX_RELEASE_STEP, Math.max(0, Math.round(releaseTime / CONFIG.DT)));
  return { angleDeci, powerCenti, releaseStep };
}

// Position of a body at simulation time t. Moving bodies are a pure function
// of t (no velocity integration), so any step can be computed independently
// and the server never has to store body state.
export function bodyPosition(body, t) {
  const o = body.orbit;
  if (!o) return { x: body.x, z: body.z };
  const a = (TAU / o.period) * t + o.phase;
  return { x: o.cx + o.r * Math.cos(a), z: o.cz + o.r * Math.sin(a) };
}

// Collision radius: black holes swallow the probe at their event horizon,
// which is larger than the sphere you see.
export function hitRadius(body) {
  return (body.kind === 'blackhole' && body.horizon ? body.horizon : body.radius) + CONFIG.PROBE_RADIUS;
}

// Squared distance from point (cx,cz) to segment (ax,az)→(bx,bz).
// Testing the whole step's segment (not just its endpoint) prevents a fast
// probe from tunneling through a small target or star between two steps.
function segDistSq(ax, az, bx, bz, cx, cz) {
  const dx = bx - ax, dz = bz - az;
  const len = dx * dx + dz * dz;
  let u = len > 0 ? ((cx - ax) * dx + (cz - az) * dz) / len : 0;
  if (u < 0) u = 0; else if (u > 1) u = 1;
  const px = ax + u * dx - cx, pz = az + u * dz - cz;
  return px * px + pz * pz;
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Simulate one shot.
 * @param level  { bounds, launcher, target, bodies, stars }
 * @param launch raw { angle, power, releaseTime } or already-quantized
 *               { angleDeci, powerCenti, releaseStep }
 * @param opts   { maxSteps } (preview uses the default; tests may shorten)
 * @returns { result: 'hit'|'crash'|'miss', steps, starsCollected, path, launch }
 */
export function simulateShot(level, launch, opts = {}) {
  const q = 'angleDeci' in (launch || {}) ? launch : quantizeLaunch(launch);
  if (!q) throw new Error('invalid launch');
  const { DT, G, MIN_D, MAX_SPEED, PATH_SAMPLE_EVERY } = CONFIG;
  const maxSteps = opts.maxSteps ?? CONFIG.MAX_STEPS;
  const minD2 = MIN_D * MIN_D;

  // Derive everything from the integers so both sides use identical floats.
  const rad = (q.angleDeci * Math.PI) / 1800;
  const speed = (q.powerCenti / 100) * MAX_SPEED;
  let x = level.launcher.x, z = level.launcher.z;
  let vx = Math.cos(rad) * speed, vz = Math.sin(rad) * speed;

  const bodies = level.bodies;
  const n = bodies.length;
  const bx = new Float64Array(n), bz = new Float64Array(n);
  const sign = new Float64Array(n), hitR2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    sign[i] = bodies[i].kind === 'repeller' ? -1 : 1;
    const r = hitRadius(bodies[i]);
    hitR2[i] = r * r;
    const p = bodyPosition(bodies[i], 0);
    bx[i] = p.x; bz[i] = p.z;
  }
  const stars = level.stars || [];
  const got = new Array(stars.length).fill(false);
  const starsCollected = [];
  const T = level.target;
  const targetR = T.radius + CONFIG.PROBE_RADIUS;
  const targetR2 = targetR * targetR;
  const B = level.bounds;

  const path = [[round3(x), round3(z)]];
  let result = 'miss';
  let step = 0;

  for (step = 1; step <= maxSteps; step++) {
    // Bodies are evaluated at the start of this step; the level clock is
    // offset by releaseStep so the orbit phase depends on when you fired.
    const t = (q.releaseStep + step - 1) * DT;
    for (let i = 0; i < n; i++) {
      if (bodies[i].orbit) { const p = bodyPosition(bodies[i], t); bx[i] = p.x; bz[i] = p.z; }
    }

    // Sum accelerations: a = G*m / max(d², minD²), toward the body
    // (away for repellers). Softening keeps it finite near centers.
    let ax = 0, az = 0;
    for (let i = 0; i < n; i++) {
      const dx = bx[i] - x, dz = bz[i] - z;
      const d2 = dx * dx + dz * dz;
      const d = Math.sqrt(d2);
      if (d === 0) continue;
      const a = (sign[i] * G * bodies[i].mass) / (d2 > minD2 ? d2 : minD2);
      ax += (a * dx) / d;
      az += (a * dz) / d;
    }

    // Semi-implicit (symplectic) Euler: velocity first, then position using
    // the NEW velocity. It conserves energy far better than explicit Euler,
    // so orbits don't spiral outward. Keep this order identical everywhere.
    vx += ax * DT; vz += az * DT;
    const px = x, pz = z;
    x += vx * DT; z += vz * DT;

    // Order of checks is part of the spec: stars, then crash, then target,
    // then bounds. A star touched on the same step you crash still counts as
    // touched, but stars only score on a hit anyway.
    for (let s = 0; s < stars.length; s++) {
      if (got[s]) continue;
      const r = stars[s].radius + CONFIG.PROBE_RADIUS;
      if (segDistSq(px, pz, x, z, stars[s].x, stars[s].z) < r * r) { got[s] = true; starsCollected.push(s); }
    }
    let crashed = false;
    for (let i = 0; i < n; i++) {
      if (segDistSq(px, pz, x, z, bx[i], bz[i]) < hitR2[i]) { crashed = true; break; }
    }
    if (crashed) { result = 'crash'; break; }
    if (segDistSq(px, pz, x, z, T.x, T.z) < targetR2) { result = 'hit'; break; }
    if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ) { result = 'miss'; break; }

    if (step % PATH_SAMPLE_EVERY === 0) path.push([round3(x), round3(z)]);
  }
  if (step > maxSteps) step = maxSteps;
  path.push([round3(x), round3(z)]);

  return { result, steps: step, starsCollected, path, launch: q };
}

// Points for clearing a level on shot number `shotNo` (1-based).
export function levelPoints(shotNo, starCount) {
  return (CONFIG.SHOTS_PER_LEVEL + 1 - shotNo) * 100 + starCount * CONFIG.STAR_POINTS;
}
