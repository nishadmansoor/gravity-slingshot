// Dev-only tool: grid-searches each level to (a) prove it is solvable,
// (b) estimate difficulty as the fraction of launches that hit, and
// (c) print one solution per level for worker/test/solutions.js.
// Usage: node worker/scripts/solve.js [levelNumber]
import { simulateShot } from '../../shared/physics.js';
import { LEVELS } from '../src/levels.js';

const only = process.argv[2] ? Number(process.argv[2]) - 1 : null;

for (const [i, level] of LEVELS.entries()) {
  if (only !== null && i !== only) continue;
  const moving = level.bodies.some((b) => b.orbit);
  const releases = moving ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5] : [0];
  let total = 0, hits = 0, starHits = 0;
  let best = null;
  const starCount = (level.stars || []).length;
  for (const releaseTime of releases) {
    for (let angle = -90; angle <= 90; angle += 0.5) {
      for (let power = 0.2; power <= 1.0001; power += 0.02) {
        total++;
        const r = simulateShot(level, { angle, power, releaseTime });
        if (r.result !== 'hit') continue;
        hits++;
        if (r.starsCollected.length === starCount && starCount > 0) starHits++;
        const score = r.starsCollected.length;
        if (!best || score > best.stars) {
          best = { stars: score, launch: { angle: Math.round(angle * 10) / 10, power: Math.round(power * 100) / 100, releaseTime }, steps: r.steps };
        }
      }
    }
  }
  console.log(
    `L${i + 1} ${level.id.padEnd(18)} hit ${(100 * hits / total).toFixed(2)}%  allStars ${(100 * starHits / total).toFixed(3)}%  best`,
    JSON.stringify(best),
  );
}
