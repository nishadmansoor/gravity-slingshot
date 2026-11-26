// Meshes for one level's static content: bodies, target, stars, launcher,
// bounds. Rebuilt whenever a new level arrives from the server.
import * as THREE from 'three';
import { bodyPosition, CONFIG } from '../../shared/physics.js';

const PALETTE = [0x4fa3ff, 0xff8a3d, 0x5ee6a8, 0xd66bff, 0xffcc4d, 0xff5e7a];

function planetMesh(body, i) {
  const color = new THREE.Color(body.color ?? PALETTE[i % PALETTE.length]);
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(body.radius, 48, 32),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.6, metalness: 0.1 }),
  );
  // A slightly larger back-face shell fakes an atmosphere glow.
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(body.radius * 1.12, 32, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  g.add(core, atmo);
  return { group: g, spin: core };
}

function blackHoleMesh(body) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(body.radius, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(body.radius * 1.9, body.radius * 0.28, 16, 96),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }),
  );
  ring.rotation.x = Math.PI / 2 - 0.35;
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(body.radius * 1.25, body.radius * 0.12, 12, 96),
    new THREE.MeshBasicMaterial({ color: 0xfff0c0, blending: THREE.AdditiveBlending, transparent: true }),
  );
  inner.rotation.x = ring.rotation.x;
  // The event horizon (the real collision radius) drawn as a faint disc so
  // players learn it is bigger than the sphere.
  const horizon = new THREE.Mesh(
    new THREE.RingGeometry(body.horizon * 0.98, body.horizon + CONFIG.PROBE_RADIUS, 64),
    new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = 0.02;
  g.add(core, ring, inner, horizon);
  return { group: g, spin: ring, spin2: inner };
}

function repellerMesh(body) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(body.radius, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0xff3df0, emissive: 0xff3df0, emissiveIntensity: 0.8, roughness: 0.3 }),
  );
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(body.radius * 1.7, 2),
    new THREE.MeshBasicMaterial({ color: 0xff7af5, wireframe: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  g.add(core, shell);
  return { group: g, spin: shell, pulse: shell };
}

export function createLevelView(scene) {
  const root = new THREE.Group();
  scene.add(root);
  let items = [];
  let target = null;
  let starMeshes = [];
  let level = null;

  function clear() {
    root.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    root.clear();
    items = []; starMeshes = []; target = null;
  }

  function build(lvl) {
    clear();
    level = lvl;
    lvl.bodies.forEach((b, i) => {
      const v = b.kind === 'blackhole' ? blackHoleMesh(b) : b.kind === 'repeller' ? repellerMesh(b) : planetMesh(b, i);
      root.add(v.group);
      items.push({ body: b, ...v });
    });

    // Target: a pulsing ring lying on the plane.
    const T = lvl.target;
    const tg = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(T.radius, 0.12, 16, 64),
      new THREE.MeshBasicMaterial({ color: 0x5dffb0, transparent: true, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = Math.PI / 2;
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(T.radius, 48),
      new THREE.MeshBasicMaterial({ color: 0x2aff8a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    glow.rotation.x = -Math.PI / 2;
    tg.add(ring, glow);
    tg.position.set(T.x, 0, T.z);
    root.add(tg);
    target = { group: tg, ring, glow };

    for (const s of lvl.stars || []) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(s.radius * 0.9, 0),
        new THREE.MeshStandardMaterial({ color: 0xffd84a, emissive: 0xffc21a, emissiveIntensity: 1.1, flatShading: true }),
      );
      m.position.set(s.x, 0.1, s.z);
      root.add(m);
      starMeshes.push(m);
    }

    // Launcher pad with a grab ring that shows where to start dragging.
    const L = lvl.launcher;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 0.25, 32),
      new THREE.MeshStandardMaterial({ color: 0x8fd8ff, emissive: 0x2a9fff, emissiveIntensity: 0.7 }),
    );
    pad.position.set(L.x, -0.15, L.z);
    const grab = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 2.4, 64),
      new THREE.MeshBasicMaterial({ color: 0x6cc8ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    );
    grab.rotation.x = -Math.PI / 2;
    grab.position.set(L.x, 0.01, L.z);
    root.add(pad, grab);

    // Bounds rectangle: leaving it is a miss.
    const B = lvl.bounds;
    const edge = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(B.minX, 0, B.minZ), new THREE.Vector3(B.maxX, 0, B.minZ),
      new THREE.Vector3(B.maxX, 0, B.maxZ), new THREE.Vector3(B.minX, 0, B.maxZ),
    ]);
    root.add(new THREE.LineLoop(edge, new THREE.LineBasicMaterial({ color: 0x3a4a7a, transparent: true, opacity: 0.6 })));
  }

  // t = simulation time (drives orbits), time = wall clock (drives effects).
  function update(t, time) {
    for (const it of items) {
      const p = bodyPosition(it.body, t);
      it.group.position.set(p.x, 0, p.z);
      if (it.spin) it.spin.rotation.y += it.body.kind === 'planet' ? 0.003 : 0;
      if (it.body.kind === 'blackhole') { it.spin.rotation.z += 0.02; it.spin2.rotation.z -= 0.035; }
      if (it.pulse) {
        const s = 1 + 0.12 * Math.sin(time * 4);
        it.pulse.scale.setScalar(s);
        it.pulse.rotation.y += 0.01;
        it.pulse.material.opacity = 0.3 + 0.2 * Math.sin(time * 4 + 1);
      }
    }
    if (target) {
      const s = 1 + 0.07 * Math.sin(time * 3);
      target.ring.scale.setScalar(s);
      target.glow.material.opacity = 0.1 + 0.08 * Math.sin(time * 3);
    }
    for (const m of starMeshes) {
      m.rotation.x += 0.02; m.rotation.y += 0.03;
      m.position.y = 0.1 + Math.sin(time * 2 + m.position.x) * 0.1;
    }
  }

  // Hide stars the probe touched on a winning shot; show them all again on retry.
  function setStarsVisible(collected) {
    starMeshes.forEach((m, i) => { m.visible = !collected.includes(i); });
  }

  return { build, update, setStarsVisible, get level() { return level; } };
}
