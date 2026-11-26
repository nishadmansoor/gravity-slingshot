// Every level must stay solvable. If physics or a layout changes and this
// fails, rerun worker/scripts/solve.js and update solutions.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot } from '../../shared/physics.js';
import { LEVELS } from '../src/levels.js';
import { SOLUTIONS } from './solutions.js';

for (const level of LEVELS) {
  test(`level ${level.id} has a known hit`, () => {
    const sol = SOLUTIONS[level.id];
    assert.ok(sol, 'missing stored solution');
    assert.equal(simulateShot(level, sol).result, 'hit');
  });
}

test('level ids are unique', () => {
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
});
