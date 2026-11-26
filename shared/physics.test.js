// Determinism tests: the anti-cheat design depends on the server being able
// to re-simulate a shot and get exactly the same answer every time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, quantizeLaunch, bodyPosition, CONFIG } from './physics.js';
import { LEVELS } from '../worker/src/levels.js';

test('same input gives bit-identical output, run twice', () => {
  for (const level of LEVELS) {
    for (const launch of [
      { angle: 12.34, power: 0.567, releaseTime: 1.234 },
      { angle: -40, power: 1, releaseTime: 0 },
      { angle: 179.9, power: 0.1, releaseTime: 7 },
    ]) {
      const a = simulateShot(level, launch);
      const b = simulateShot(structuredClone(level), { ...launch });
      assert.deepEqual(a, b);
      assert.equal(JSON.stringify(a), JSON.stringify(b));
    }
  }
});

test('quantization collapses nearby inputs to the same shot', () => {
  const level = LEVELS[0];
  const a = simulateShot(level, { angle: 10.04, power: 0.501, releaseTime: 0.001 });
  const b = simulateShot(level, { angle: 9.96, power: 0.499, releaseTime: 0 });
  assert.deepEqual(a, b);
  assert.deepEqual(a.launch, { angleDeci: 100, powerCenti: 50, releaseStep: 0 });
});

test('quantizeLaunch rejects junk and clamps ranges', () => {
  assert.equal(quantizeLaunch(null), null);
  assert.equal(quantizeLaunch({ angle: 'x', power: 1, releaseTime: 0 }), null);
  assert.equal(quantizeLaunch({ angle: NaN, power: 1, releaseTime: 0 }), null);
  assert.equal(quantizeLaunch({ angle: 1, power: Infinity, releaseTime: 0 }), null);
  const q = quantizeLaunch({ angle: -0.5, power: 99, releaseTime: -5 });
  assert.deepEqual(q, { angleDeci: 3595, powerCenti: 100, releaseStep: 0 });
  assert.equal(quantizeLaunch({ angle: 0, power: 0, releaseTime: 1e12 }).powerCenti, 10);
  assert.equal(quantizeLaunch({ angle: 0, power: 0, releaseTime: 1e12 }).releaseStep, CONFIG.MAX_RELEASE_STEP);
});

test('orbits are a pure function of time', () => {
  const body = { orbit: { cx: 1, cz: 2, r: 3, period: 4, phase: 0.5 } };
  assert.deepEqual(bodyPosition(body, 2.5), bodyPosition(body, 2.5));
  const full = bodyPosition(body, 4);
  const start = bodyPosition(body, 0);
  assert.ok(Math.abs(full.x - start.x) < 1e-9 && Math.abs(full.z - start.z) < 1e-9);
});

test('a shot never exceeds the step budget', () => {
  // Launch straight into a stable-ish orbit region; whatever happens it must stop.
  for (const level of LEVELS) {
    const r = simulateShot(level, { angle: 90, power: 0.1, releaseTime: 0 });
    assert.ok(r.steps <= CONFIG.MAX_STEPS);
    assert.ok(['hit', 'crash', 'miss'].includes(r.result));
  }
});
