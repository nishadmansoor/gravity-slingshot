// Dev-only: checks the hidden mass variation against two questions.
//  1. Does every level stay solvable for every seed? (min hit % > 0)
//  2. How often does a shot solved offline against the NOMINAL level (what a
//     coding agent can compute from the client code) still hit for real?
// Usage: node worker/scripts/variation-check.js [seedCount]
import { simulateShot } from '../../shared/physics.js';
import { LEVELS } from '../src/levels.js';
import { varyLevel } from '../src/variation.js';

const SEEDS = Array.from({ length: Number(process.argv[2] || 20) }, (_, i) => (i * 2654435761 + 12345) >>> 0);

function launches(level) {
  const moving = level.bodies.some((b) => b.orbit);
  const out = [];
  for (const releaseTime of moving ? [0, 1, 2, 3, 4, 5, 6] : [0]) {
    for (let angle = -90; angle <= 90; angle += 1) {
      for (let power = 0.2; power <= 1.0001; power += 0.02) out.push({ angle, power, releaseTime });
    }
  }
  return out;
}

for (const [i, level] of LEVELS.entries()) {
  const grid = launches(level);
  const nominalHits = grid.filter((l) => simulateShot(level, l).result === 'hit');
  let minHit = Infinity, sumTransfer = 0;
  for (const seed of SEEDS) {
    const v = varyLevel(level, seed);
    const hits = grid.reduce((n, l) => n + (simulateShot(v, l).result === 'hit'), 0);
    minHit = Math.min(minHit, (100 * hits) / grid.length);
    const still = nominalHits.reduce((n, l) => n + (simulateShot(v, l).result === 'hit'), 0);
    sumTransfer += nominalHits.length ? still / nominalHits.length : 0;
  }
  console.log(
    `L${i + 1} ${level.id.padEnd(18)} nominal hits ${String(nominalHits.length).padStart(5)}` +
    `  min hit% over seeds ${minHit.toFixed(2)}` +
    `  offline shot still hits ${(100 * sumTransfer / SEEDS.length).toFixed(1)}%`,
  );
}
