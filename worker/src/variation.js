// Hidden per-run variation. SERVER-ONLY: never import this from the client.
//
// Why: the level layout and physics must reach the client (it has to draw
// and preview them), so a coding agent can copy them and solve every level
// offline before firing a single shot. In testing, an agent did exactly that
// and cleared all 8 levels on the first shot in about 7 minutes.
//
// Fix: every run gets a secret random seed, stored only in D1. The server
// nudges each body's mass by 5–12% (up or down) based on that seed, and
// simulates shots against the nudged level. The client only ever sees the
// nominal masses. A human aims by feel and by the ghost trails of earlier
// shots, which are the true server paths, so they barely notice. An agent
// can no longer one-shot from the code alone; it has to spend shots to
// measure the hidden values, like a human learning the level.
const MIN_NUDGE = 0.05;
const MAX_NUDGE = 0.12;

// Small, fast, seedable PRNG (mulberry32). Deterministic so the same run
// always gets the same variation, and any shot can be replayed later.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: mixes the level id into the seed so each level varies differently.
function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

// Mass multiplier for each body, always at least MIN_NUDGE away from 1 so
// the nominal (client-visible) level is never accidentally exact.
export function massFactors(level, seed) {
  const rand = mulberry32((seed ^ hashString(level.id)) >>> 0);
  return level.bodies.map(() => {
    const size = MIN_NUDGE + rand() * (MAX_NUDGE - MIN_NUDGE);
    return rand() < 0.5 ? 1 - size : 1 + size;
  });
}

export function varyLevel(level, seed) {
  const f = massFactors(level, seed);
  return { ...level, bodies: level.bodies.map((b, i) => ({ ...b, mass: b.mass * f[i] })) };
}

export function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export const NUDGE_RANGE = { min: MIN_NUDGE, max: MAX_NUDGE };
