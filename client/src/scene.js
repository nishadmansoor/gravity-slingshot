// Renderer, camera, lights, starfield and bloom. Knows nothing about the game.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TILT = THREE.MathUtils.degToRad(40); // camera angle away from straight down

function makeStarLayer(count, spread, depth, size, color) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = -depth - Math.random() * depth * 0.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.7;
    // Slight color variety: mostly white, some blue and warm stars.
    c.set(color).offsetHSL((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
  return new THREE.Points(g, m);
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x03040a, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03040a, 0.006);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);

  scene.add(new THREE.AmbientLight(0x8899ff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-15, 30, 12);
  scene.add(sun);

  // Three layers at different depths. Parallax moves the star layers (near
  // ones more than far ones) instead of the camera, so the camera stays
  // perfectly still and screen→plane aiming never drifts under the cursor.
  const layers = [
    [makeStarLayer(1800, 260, 60, 0.5, 0xdfe8ff), 0.6],
    [makeStarLayer(1000, 200, 30, 0.35, 0xbcd0ff), 1.4],
    [makeStarLayer(400, 140, 14, 0.25, 0xffe6c8), 2.6],
  ];
  for (const [pts] of layers) scene.add(pts);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 0.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const focus = new THREE.Vector3();
  let distance = 40;
  let bounds = { minX: -20, maxX: 20, minZ: -12, maxZ: 12 };
  const parallax = new THREE.Vector2();
  const parallaxSmoothed = new THREE.Vector2();

  function fit(b = bounds) {
    bounds = b;
    const w = b.maxX - b.minX, h = b.maxZ - b.minZ;
    focus.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2 + 0.6);
    const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Fit the level rectangle in both directions with a margin for the HUD
    // and the tilt's perspective (the near edge looks larger).
    distance = Math.max((h * 0.62) / vt, (w * 0.56) / (vt * camera.aspect));
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
  }
  window.addEventListener('resize', resize);
  resize();

  function render(time) {
    parallaxSmoothed.lerp(parallax, 0.04);
    const drift = Math.sin(time * 0.05);
    for (const [pts, k] of layers) {
      pts.position.x = -(parallaxSmoothed.x + drift * 0.3) * k;
      pts.position.z = -parallaxSmoothed.y * k * 0.7;
    }
    camera.position.set(focus.x, Math.cos(TILT) * distance, focus.z + Math.sin(TILT) * distance);
    camera.lookAt(focus);
    composer.render();
  }

  // Screen point → point on the simulation plane (y = 0).
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  function toPlane(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  }

  return {
    scene,
    camera,
    render,
    fit,
    toPlane,
    setParallax: (nx, ny) => parallax.set(nx, ny),
  };
}
