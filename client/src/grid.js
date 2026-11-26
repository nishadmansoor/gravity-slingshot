// "Rubber sheet" grid under the level: it sags around massive bodies and
// bulges around repellers. Purely visual, but it lets a human see at a glance
// where gravity is strong and which way it pulls.
import * as THREE from 'three';
import { bodyPosition } from '../../shared/physics.js';

const STEP = 1;     // grid line spacing (world units)
const RES = 0.5;    // sample spacing along each line
const DEPTH_K = 0.03;
const MAX_DEPTH = 4;

export function createGrid(scene) {
  let mesh = null;
  let samples = null; // flat [x, z, x, z, ...] for every vertex
  let level = null;
  let colors = null;

  function build(lvl) {
    dispose();
    level = lvl;
    const b = lvl.bounds;
    const pts = [];
    const line = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / RES));
      for (let i = 0; i < n; i++) {
        const a = i / n, c = (i + 1) / n;
        pts.push(x0 + (x1 - x0) * a, z0 + (z1 - z0) * a, x0 + (x1 - x0) * c, z0 + (z1 - z0) * c);
      }
    };
    for (let z = b.minZ; z <= b.maxZ + 1e-6; z += STEP) line(b.minX, z, b.maxX, z);
    for (let x = b.minX; x <= b.maxX + 1e-6; x += STEP) line(x, b.minZ, x, b.maxZ);
    samples = new Float32Array(pts);
    const count = samples.length / 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    colors = new Float32Array(count * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const m = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    mesh = new THREE.LineSegments(g, m);
    scene.add(mesh);
    update(0, true);
  }

  // Recomputed every frame only when something moves.
  function update(t, force = false) {
    if (!mesh || (!force && !level.bodies.some((b) => b.orbit))) return;
    const bodies = level.bodies.map((b) => ({ ...bodyPosition(b, t), m: b.mass, s: b.kind === 'repeller' ? -1 : 1, r: b.radius }));
    const pos = mesh.geometry.attributes.position.array;
    const b = level.bounds;
    for (let i = 0, j = 0; i < samples.length; i += 2, j += 3) {
      const x = samples[i], z = samples[i + 1];
      let y = 0;
      for (const o of bodies) {
        const dx = x - o.x, dz = z - o.z;
        y -= (o.s * o.m * DEPTH_K) / Math.sqrt(dx * dx + dz * dz + o.r * o.r);
      }
      y = Math.max(-MAX_DEPTH, Math.min(1.2, y)) - 0.35;
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
      // Deeper = brighter and bluer; bumps glow pink. Fade near the edges.
      const edge = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
      const fade = Math.min(1, edge / 3) * 0.75 + 0.25;
      const d = Math.min(1, Math.abs(y + 0.35) / MAX_DEPTH);
      if (y + 0.35 >= 0) { colors[j] = 0.10 + d * 0.9; colors[j + 1] = 0.06; colors[j + 2] = 0.18 + d * 0.4; }
      else { colors[j] = 0.04 + d * 0.15; colors[j + 1] = 0.08 + d * 0.35; colors[j + 2] = 0.2 + d * 0.6; }
      colors[j] *= fade; colors[j + 1] *= fade; colors[j + 2] *= fade;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.color.needsUpdate = true;
  }

  function dispose() {
    if (!mesh) return;
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = null;
  }

  return { build, update, dispose };
}
