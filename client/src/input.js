// Drag-to-aim slingshot controls (mouse and touch via Pointer Events).
// Press near the launcher, pull back, release. Direction is opposite the
// drag, power is drag length. Emits raw floats; quantization happens in
// shared/physics.js (and again on the server).
const MAX_DRAG = 7;      // world units for full power
const GRAB_RADIUS = 2.4; // must press within this distance of the launcher
const CANCEL_POWER = 0.06; // releasing with almost no pull cancels the shot

export function createInput(canvas, { toPlane, getLauncher, onAim, onFire, onCancel, onPointer }) {
  let enabled = false;
  let dragging = false;
  let pointerId = null;

  function aimFrom(p) {
    const L = getLauncher();
    const dx = L.x - p.x, dz = L.z - p.z;
    const len = Math.hypot(dx, dz);
    const power = Math.min(1, len / MAX_DRAG);
    const angle = (Math.atan2(dz, dx) * 180) / Math.PI;
    // Where the band is drawn: the pointer, clamped to max pull length.
    const k = len > MAX_DRAG ? MAX_DRAG / len : 1;
    return { angle, power, pull: { x: L.x - dx * k, z: L.z - dz * k } };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!enabled || dragging) return;
    const p = toPlane(e.clientX, e.clientY);
    const L = getLauncher();
    if (!p || Math.hypot(p.x - L.x, p.z - L.z) > GRAB_RADIUS) return;
    dragging = true;
    pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic/stale pointer */ }
    onAim(aimFrom(p));
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    onPointer?.(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    if (!dragging || e.pointerId !== pointerId) return;
    const p = toPlane(e.clientX, e.clientY);
    if (p) onAim(aimFrom(p));
  });

  function end(e, cancelled) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    const p = toPlane(e.clientX, e.clientY);
    const aim = p && aimFrom(p);
    if (cancelled || !aim || aim.power < CANCEL_POWER) onCancel();
    else onFire({ angle: aim.angle, power: aim.power });
  }
  canvas.addEventListener('pointerup', (e) => end(e, false));
  canvas.addEventListener('pointercancel', (e) => end(e, true));

  return {
    setEnabled(v) { enabled = v; if (!v && dragging) { dragging = false; onCancel(); } },
    cancel() { if (dragging) { dragging = false; pointerId = null; onCancel(); } },
    get dragging() { return dragging; },
  };
}
