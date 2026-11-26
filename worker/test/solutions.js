// One known-good launch per level, found with worker/scripts/solve.js.
// TEST-ONLY: this file must never be imported by client code or the Worker.
// If a level or the physics changes, rerun the solver and update these.
export const SOLUTIONS = {
  'l1-first-curve': { angle: -50, power: 0.2, releaseTime: 0 },
  'l2-behind': { angle: 25.5, power: 0.28, releaseTime: 0 },
  'l3-tug': { angle: -57.5, power: 0.24, releaseTime: 0 },
  'l4-event-horizon': { angle: -53.5, power: 0.2, releaseTime: 0 },
  'l5-needle': { angle: -3, power: 0.2, releaseTime: 0 },
  'l6-push-back': { angle: -16, power: 0.62, releaseTime: 0 },
  'l7-timing': { angle: -63, power: 0.2, releaseTime: 0 },
  'l8-grand-tour': { angle: 25.5, power: 0.76, releaseTime: 0 },
};
