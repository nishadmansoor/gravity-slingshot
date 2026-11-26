// Boot, game loop and state machine:
//   menu → playing → (levelClear → playing)* → gameOver → leaderboard
// Within `playing`, a shot goes idle → aiming → waiting (server) → flying.
//
// All mutable state lives in the `S` object inside this module's closure;
// nothing is put on `window`. That doesn't make cheating impossible (the
// server is what does that), it just avoids handing a browser agent a
// convenient console handle.
import { CONFIG, simulateShot } from '../../shared/physics.js';
import { createScene } from './scene.js';
import { createGrid } from './grid.js';
import { createLevelView } from './levelView.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { api } from './api.js';
import { pathAt } from './flight.js';

const view = createScene(document.getElementById('game'));
const grid = createGrid(view.scene);
const levelView = createLevelView(view.scene);
const fx = createRenderer(view.scene);
const hud = createHud();

const S = {
  state: 'menu',
  phase: 'idle',
  paused: false,
  runId: null,
  level: null,
  levelCount: 8,
  shotsPerLevel: CONFIG.SHOTS_PER_LEVEL,
  shotsLeft: CONFIG.SHOTS_PER_LEVEL,
  score: 0,
  levelsCleared: 0,
  clock: 0,        // level clock in seconds; drives orbiting bodies
  aim: null,       // { angle, power, pull }
  flight: null,    // server response being animated
  fastForward: false,
  pendingNext: null,
  runComplete: false,
  shotsTaken: 0,
};

// Decorative scene behind the menu (not a real level; never sent anywhere).
const MENU_SCENE = {
  bounds: { minX: -20, maxX: 20, minZ: -12, maxZ: 12 },
  launcher: { x: -17, z: 0 },
  target: { x: 15, z: 3, radius: 1.2 },
  bodies: [
    { x: -3, z: -2, radius: 2.2, mass: 100, kind: 'planet', color: 0x4fa3ff },
    { x: 7, z: 4, radius: 0.8, horizon: 1.7, mass: 180, kind: 'blackhole' },
    { x: 0, z: 0, radius: 1, mass: 50, kind: 'planet', color: 0xff8a3d, orbit: { cx: -3, cz: -2, r: 5.5, period: 9, phase: 0 } },
    { x: 12, z: -6, radius: 1.1, mass: 80, kind: 'repeller' },
  ],
  stars: [{ x: 3, z: -7, radius: 0.45 }],
};

function showLevel(lvl) {
  levelView.build(lvl);
  grid.build(lvl);
  fx.clearGhosts();
  fx.resetTrail();
  fx.setProbe(null);
  fx.setPreview(null);
  fx.setBand(null);
  view.fit(lvl.bounds);
}

function updateStats() {
  hud.stats({
    index: S.level.index, count: S.levelCount, name: S.level.name,
    shotsLeft: S.shotsLeft, shotsPerLevel: S.shotsPerLevel, score: S.score,
  });
}

function loadLevel(lvl) {
  S.level = lvl;
  S.shotsLeft = S.shotsPerLevel;
  S.clock = 0;
  S.phase = 'idle';
  showLevel(lvl);
  updateStats();
  hud.show(null);
  hud.setPlaying(true);
  hud.hint(lvl.index === 0 ? 'Press on the blue launcher and pull back to aim' : `Level ${lvl.index + 1}: ${lvl.name}`);
  S.state = 'playing';
  input.setEnabled(true);
}

async function startRun() {
  hud.show(null);
  hud.toast('Starting run…', 'miss', 1200);
  try {
    const r = await api.startRun();
    Object.assign(S, { runId: r.runId, levelCount: r.levelCount, shotsPerLevel: r.shotsPerLevel, score: 0, levelsCleared: 0, runComplete: false, quitEarly: false, shotsTaken: 0 });
    loadLevel(r.level);
  } catch (e) {
    hud.toast(e.message, 'crash', 3000);
    toMenu();
  }
}

function toMenu() {
  S.state = 'menu';
  S.paused = false;
  input.setEnabled(false);
  hud.setPlaying(false);
  S.level = null;
  showLevel(MENU_SCENE);
  hud.show('menu');
}

async function showBoard(highlight) {
  S.state = 'leaderboard';
  input.setEnabled(false);
  hud.setPlaying(false);
  hud.board(null);
  try {
    const { entries } = await api.leaderboard();
    hud.board(entries, highlight);
  } catch (e) {
    hud.board([]);
    hud.toast(e.message, 'crash', 3000);
  }
}

function gameOver() {
  S.state = 'gameOver';
  input.setEnabled(false);
  hud.setPlaying(false);
  hud.gameOver({
    title: S.runComplete ? 'All levels cleared!' : S.quitEarly ? 'Run ended' : 'Out of shots',
    score: S.score, levelsCleared: S.levelsCleared, count: S.levelCount,
  });
}

// ---- Shooting ---------------------------------------------------------------

async function fire(launch) {
  if (S.phase !== 'aiming') return;
  S.phase = 'waiting';
  input.setEnabled(false);
  fx.setPreview(null);
  fx.setBand(null);
  hud.aim(null);
  hud.hint(null);
  try {
    // The server simulates; we only animate what it returns.
    const res = await api.shot(S.runId, S.level.id, { ...launch, releaseTime: S.clock });
    S.shotsTaken++;
    S.flight = { res, t: 0, releaseT: res.launch.releaseStep * CONFIG.DT };
    S.clock = S.flight.releaseT;
    fx.resetTrail();
    levelView.setStarsVisible([]);
    S.phase = 'flying';
  } catch (e) {
    S.phase = 'idle';
    if (e.code === 'too_fast') hud.toast('Easy! Wait a moment between shots', 'warn');
    else if (e.code === 'run_expired') { hud.toast('Run expired (idle too long)', 'crash', 3000); toMenu(); return; }
    else hud.toast(e.message, 'crash', 2500);
    input.setEnabled(true);
  }
}

function updateFlight(dt) {
  const f = S.flight;
  f.t += dt * (S.fastForward ? 4 : 1);
  const duration = f.res.steps * CONFIG.DT;
  if (f.t > duration) f.t = duration;
  S.clock = f.releaseT + f.t;
  const p = pathAt(f.res, f.t / CONFIG.DT);
  fx.setProbe(p.x, p.z);
  fx.pushTrail(p.x, p.z);
  if (f.t >= duration) endFlight();
}

const RESULT_TEXT = { hit: 'Target hit!', crash: 'Crashed!', miss: 'Lost in space' };

function endFlight() {
  const { res } = S.flight;
  S.flight = null;
  const end = res.path[res.path.length - 1];
  fx.burst(end[0], end[1], res.result);
  fx.setProbe(null);
  fx.addGhost(res.path, res.result);
  S.score = res.score;
  S.levelsCleared = res.levelsCleared;
  S.shotsLeft = res.levelCleared ? S.shotsPerLevel - res.shotNo : res.shotsLeft;
  updateStats();
  hud.toast(RESULT_TEXT[res.result], res.result);

  if (res.levelCleared) {
    levelView.setStarsVisible(res.starsCollected);
    S.pendingNext = res.nextLevel;
    S.runComplete = res.status === 'complete';
    S.phase = 'done';
    setTimeout(() => {
      S.state = 'levelClear';
      hud.levelClear({ shotNo: res.shotNo, points: res.points, stars: res.starsCollected.length, score: res.score, last: !res.nextLevel });
    }, 900);
  } else if (res.status !== 'active') {
    S.phase = 'done';
    setTimeout(gameOver, 1100);
  } else {
    S.phase = 'idle';
    input.setEnabled(true);
    if (S.shotsLeft === 1) hud.hint('Last shot!');
  }
}

// ---- Input ------------------------------------------------------------------

const input = createInput(document.getElementById('game'), {
  toPlane: view.toPlane,
  getLauncher: () => S.level.launcher,
  onAim(a) {
    if (S.paused) return;
    S.phase = 'aiming';
    S.aim = a;
    hud.hint(null);
  },
  onFire(launch) { fire(launch); },
  onCancel() {
    if (S.phase === 'aiming') S.phase = 'idle';
    S.aim = null;
    fx.setPreview(null); fx.setBand(null); hud.aim(null);
  },
  onPointer: (nx, ny) => view.setParallax(nx, ny),
});

function setPaused(p) {
  if (S.state !== 'playing') return;
  S.paused = p;
  input.cancel();
  input.setEnabled(!p && S.phase === 'idle');
  hud.show(p ? 'pause' : null);
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'Escape') setPaused(!S.paused);
  if (S.state !== 'playing' || S.paused) return;
  if (e.key === 'r' || e.key === 'R') {
    if (S.phase === 'aiming') input.cancel();
    else if (S.phase === 'flying') S.flight.t = Infinity; // skip; the shot already counted
  }
  if (e.key === ' ') { S.fastForward = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') S.fastForward = false; });
window.addEventListener('blur', () => { S.fastForward = false; if (S.state === 'playing' && !S.paused) setPaused(true); });

hud.on({
  start: startRun,
  board: () => showBoard(),
  menu: toMenu,
  next() {
    if (S.pendingNext) { const l = S.pendingNext; S.pendingNext = null; loadLevel(l); }
    else gameOver();
  },
  resume: () => setPaused(false),
  async quit() {
    // Ending early keeps the score so far and still lets you post it.
    setPaused(false);
    if (S.phase === 'flying' || S.phase === 'waiting') return; // let the shot land first
    try {
      const r = await api.endRun(S.runId);
      Object.assign(S, { score: r.score, levelsCleared: r.levelsCleared, runComplete: false, quitEarly: true });
      gameOver();
    } catch { toMenu(); }
  },
  async submit(name) {
    hud.submitting();
    try {
      const r = await api.finish(S.runId, name);
      showBoard({ name: r.name, score: r.score });
    } catch (e) {
      hud.submitError(e.code === 'bad_name' ? e.message : `Could not submit: ${e.message}`);
    }
  },
});

// ---- Loop -------------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  const lvl = S.level || MENU_SCENE;

  if (!S.paused) {
    if (S.state === 'playing' && S.phase === 'flying') updateFlight(dt);
    else if (S.phase !== 'waiting') S.clock += dt;

    if (S.state === 'playing' && S.phase === 'aiming' && S.aim) {
      // Local simulation is used ONLY for this short preview. Recomputed
      // every frame so it tracks orbiting bodies as the clock runs.
      const sim = simulateShot(lvl, { angle: S.aim.angle, power: S.aim.power, releaseTime: S.clock });
      fx.setPreview(sim.path);
      fx.setBand(lvl.launcher, S.aim.pull, S.aim.power);
      hud.aim(S.aim);
    }
  }
  levelView.update(S.clock, time);
  grid.update(S.clock);
  fx.update(dt);
  view.render(time);
  requestAnimationFrame(frame);
}

toMenu();
requestAnimationFrame(frame);
