// Dynamic visuals: the probe and its fading trail, ghost trails of earlier
// shots, the short dotted aim preview, the slingshot band, and burst effects.
import * as THREE from 'three';
import { CONFIG } from '../../shared/physics.js';

const TRAIL_LEN = 90;
const Y = 0.05; // lift lines slightly above the plane

export function createRenderer(scene) {
  // Probe
  const probe = new THREE.Mesh(
    new THREE.SphereGeometry(CONFIG.PROBE_RADIUS * 1.3, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xe8fbff }),
  );
  probe.visible = false;
  scene.add(probe);

  // Trail: a line whose vertex colors carry alpha (RGBA), fading to 0 at the tail.
  const trailPos = new Float32Array(TRAIL_LEN * 3);
  const trailCol = new Float32Array(TRAIL_LEN * 4);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  trail.frustumCulled = false;
  scene.add(trail);
  let trailCount = 0;

  function resetTrail() { trailCount = 0; trailGeo.setDrawRange(0, 0); }
  function pushTrail(x, z) {
    // Newest point at index 0; shift older ones back.
    trailPos.copyWithin(3, 0, (TRAIL_LEN - 1) * 3);
    trailPos[0] = x; trailPos[1] = Y; trailPos[2] = z;
    trailCount = Math.min(TRAIL_LEN, trailCount + 1);
    for (let i = 0; i < trailCount; i++) {
      const a = 1 - i / trailCount;
      trailCol.set([0.55 + 0.45 * a, 0.85, 1, a * a], i * 4);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
    trailGeo.setDrawRange(0, trailCount);
  }

  // Ghost trails of previous shots on this level.
  const ghosts = new THREE.Group();
  scene.add(ghosts);
  function addGhost(path, result) {
    const pts = path.map(([x, z]) => new THREE.Vector3(x, Y * 0.5, z));
    const color = result === 'hit' ? 0x5dffb0 : result === 'crash' ? 0xff7a50 : 0x8fa8ff;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    ghosts.add(line);
  }
  function clearGhosts() {
    ghosts.children.forEach((l) => { l.geometry.dispose(); l.material.dispose(); });
    ghosts.clear();
  }

  // Aim preview: dots along the first ~15% of the path only.
  const previewGeo = new THREE.BufferGeometry();
  const preview = new THREE.Points(previewGeo, new THREE.PointsMaterial({
    color: 0xcfefff, size: 0.3, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  preview.frustumCulled = false;
  scene.add(preview);
  function setPreview(path) {
    if (!path) { preview.visible = false; return; }
    const n = Math.max(2, Math.ceil(path.length * CONFIG.PREVIEW_FRACTION));
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n && i < path.length; i++) arr.set([path[i][0], Y, path[i][1]], i * 3);
    previewGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    preview.visible = true;
  }

  // Slingshot band from the launcher to the pointer.
  const bandGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const band = new THREE.Line(bandGeo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8 }));
  band.visible = false;
  band.frustumCulled = false;
  scene.add(band);
  function setBand(from, to, power) {
    if (!from) { band.visible = false; return; }
    const p = bandGeo.attributes.position;
    p.setXYZ(0, from.x, Y, from.z); p.setXYZ(1, to.x, Y, to.z);
    p.needsUpdate = true;
    band.material.color.setHSL(0.13 - power * 0.13, 1, 0.6); // yellow → red with power
    band.visible = true;
  }

  // Expanding ring bursts for hits and crashes.
  const bursts = [];
  function burst(x, z, kind) {
    const color = kind === 'hit' ? 0x5dffb0 : kind === 'crash' ? 0xff8040 : 0x8fa8ff;
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.45, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.1, z);
    scene.add(m);
    bursts.push({ m, age: 0 });
  }

  function update(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.age += dt;
      b.m.scale.setScalar(1 + b.age * 9);
      b.m.material.opacity = Math.max(0, 1 - b.age / 0.9);
      if (b.age > 0.9) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); bursts.splice(i, 1); }
    }
  }

  function setProbe(x, z) {
    if (x === null) { probe.visible = false; return; }
    probe.visible = true;
    probe.position.set(x, Y, z);
  }

  return { setProbe, resetTrail, pushTrail, addGhost, clearGhosts, setPreview, setBand, burst, update };
}
