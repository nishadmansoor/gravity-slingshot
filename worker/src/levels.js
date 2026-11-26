// Level definitions. This file is the server-side source of truth: the client
// never bundles it, and receives each level only after clearing the previous
// one (see /api/run/shot). Coordinates are on the 2D simulation plane (x, z).
//
// Body: { x, z, radius, mass, kind: 'planet'|'blackhole'|'repeller',
//         horizon? (black holes), orbit? { cx, cz, r, period, phase } }
// Moving bodies ignore x/z and follow their orbit as a pure function of time.

const BOUNDS = { minX: -20, maxX: 20, minZ: -12, maxZ: 12 };
const LAUNCHER = { x: -17, z: 0 };

export const LEVELS = [
  {
    id: 'l1-first-curve',
    name: 'First Curve',
    bounds: BOUNDS,
    launcher: LAUNCHER,
    target: { x: 15, z: -5, radius: 1.6 },
    bodies: [{ x: -1, z: -1.5, radius: 1.8, mass: 70, kind: 'planet', color: 0x4fa3ff }],
    stars: [],
    par: 2,
  },
  {
    id: 'l2-behind',
    name: 'Hide and Seek',
    bounds: BOUNDS,
    launcher: LAUNCHER,
    target: { x: 14, z: 0, radius: 1.2 },
    bodies: [{ x: 4, z: 0, radius: 2.4, mass: 110, kind: 'planet', color: 0xff8a3d }],
    stars: [{ x: 4, z: 6.5, radius: 0.45 }],
    par: 2,
  },
  {
    id: 'l3-tug',
    name: 'Tug of War',
    bounds: BOUNDS,
    launcher: LAUNCHER,
    target: { x: 16, z: 6, radius: 1.2 },
    bodies: [
      { x: -4, z: 6, radius: 1.7, mass: 85, kind: 'planet', color: 0x5ee6a8 },
      { x: 5, z: -5, radius: 2.0, mass: 110, kind: 'planet', color: 0xd66bff },
    ],
    stars: [],
    par: 3,
  },
  {
    id: 'l4-event-horizon',
    name: 'Event Horizon',
    bounds: BOUNDS,
    launcher: LAUNCHER,
    target: { x: 9, z: 8, radius: 1.1 },
    bodies: [{ x: 3, z: -1, radius: 0.8, horizon: 1.8, mass: 230, kind: 'blackhole' }],
    stars: [{ x: 10, z: -2, radius: 0.45 }],
    par: 3,
  },
  {
    id: 'l5-needle',
    name: 'The Needle',
    bounds: BOUNDS,
    launcher: LAUNCHER,
    target: { x: 15, z: -6, radius: 1.1 },
    bodies: [
      { x: 1, z: 2.9, radius: 1.8, mass: 90, kind: 'planet', color: 0x3dd6ff },
      { x: 1, z: -2.9, radius: 1.8, mass: 90, kind: 'planet', color: 0xffcc4d },
    ],
    stars: [{ x: 1, z: 0, radius: 0.4 }],
    par: 3,
  },
  {
    id: 'l6-push-back',
    name: 'Push Back',
    bounds: BOUNDS,
    launcher: LAUNCHER,
    target: { x: 13, z: 7, radius: 1.2 },
    bodies: [
      { x: 8, z: -7, radius: 1.3, mass: 140, kind: 'repeller' },
      { x: 2, z: 3, radius: 2.2, mass: 100, kind: 'planet', color: 0xffa23d },
    ],
    stars: [{ x: 7, z: -3.5, radius: 0.45 }],
    par: 3,
  },
  {
    id: 'l7-timing',
    name: 'Clockwork',
    bounds: BOUNDS,
    launcher: LAUNCHER,
    target: { x: 15, z: 2, radius: 1.1 },
    bodies: [
      { x: 0, z: 0, radius: 1.6, mass: 110, kind: 'planet', color: 0xff5e7a,
        orbit: { cx: 2, cz: 0, r: 5, period: 7, phase: 0 } },
      { x: 2, z: 0, radius: 1.0, mass: 40, kind: 'planet', color: 0xffe08a },
    ],
    stars: [],
    par: 3,
  },
  {
    id: 'l8-grand-tour',
    name: 'Grand Tour',
    bounds: BOUNDS,
    launcher: LAUNCHER,
    target: { x: 16, z: 0, radius: 1.2 },
    bodies: [
      { x: -7, z: -5, radius: 1.6, mass: 90, kind: 'planet', color: 0x4fa3ff },
      { x: 2, z: 3, radius: 0.7, horizon: 1.6, mass: 200, kind: 'blackhole' },
      { x: 10, z: -3, radius: 1.2, mass: 150, kind: 'repeller' },
      { x: 0, z: 0, radius: 1.1, mass: 60, kind: 'planet', color: 0xff8a3d,
        orbit: { cx: 9, cz: 6, r: 3.5, period: 5, phase: 1.2 } },
    ],
    stars: [{ x: -6.6, z: 4.3, radius: 0.45 }, { x: 8.5, z: 8, radius: 0.45 }],
    par: 4,
  },
];

// The client gets a copy without anything it doesn't need to render or preview.
export function publicLevel(index) {
  const l = LEVELS[index];
  if (!l) return null;
  return { ...l, index, count: LEVELS.length };
}
