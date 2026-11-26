# AGENTS.md — Gravity Slingshot

## Project overview

A small browser game built with Three.js. The player launches a probe through a field of planets whose gravity bends its path, trying to hit a target gate on the far side of the level. The player controls only the launch (direction and power); after release, physics takes over.

Design goals, in priority order:
1. Humans understand it in seconds and enjoy experimenting with shots.
2. It is hard for an AI agent (browser agents, coding agents) to score highly.
3. Scores cannot be faked by editing client code or sending forged requests.

Keep scope small. This must be finishable in about one week.

## Tech stack

- Frontend: Vite + vanilla JavaScript (ES modules) + Three.js. No React, no TypeScript unless already set up.
- Post-processing: Three.js `EffectComposer` with `UnrealBloomPass` for glow.
- Physics: custom code only. Do NOT add cannon-es, Rapier, Ammo, or any physics library.
- Backend: Cloudflare Worker (Wrangler) with a D1 database for runs and the leaderboard. The same Worker serves the built client as static assets (`[assets]` in wrangler.toml), so the game deploys to one URL.
- Shared code: one deterministic physics module imported by both the client and the Worker.

## Repository layout

```
/
├── AGENTS.md
├── package.json             # root: `npm test` runs all tests (node --test)
├── client/
│   ├── index.html           # canvas + DOM overlay screens
│   ├── src/
│   │   ├── main.js          # boot, game loop, state machine
│   │   ├── scene.js         # renderer, camera, lights, starfield, bloom
│   │   ├── input.js         # drag-to-aim slingshot controls
│   │   ├── render.js        # probe, trails, ghost trails, preview, bursts
│   │   ├── levelView.js     # planets, black holes, repellers, target, stars
│   │   ├── grid.js          # gravity-well "rubber sheet" grid (visual only)
│   │   ├── flight.js        # interpolates the server-returned path
│   │   ├── hud.js           # shots left, score, level, messages (DOM overlay)
│   │   ├── style.css
│   │   └── api.js           # all calls to the Worker
│   └── vite.config.js       # dev proxy /api → wrangler dev; fs.allow for shared/
├── shared/
│   ├── physics.js           # deterministic simulation, used by client AND worker
│   └── physics.test.js      # determinism tests
├── worker/
│   ├── src/index.js         # API routes, CORS, JSON parsing
│   ├── src/runs.js          # run/shot/finish logic and anti-cheat checks
│   ├── src/levels.js        # level definitions (server-side source of truth)
│   ├── scripts/solve.js     # dev-only grid-search solver / difficulty meter
│   ├── test/                # API + level tests, fake D1 (node:sqlite), solutions.js
│   ├── schema.sql           # D1 tables
│   └── wrangler.toml
└── README.md                # player instructions + how to run/deploy
```

## Game rules

- A run is a sequence of levels (start with 8 handcrafted levels).
- Each level allows 5 shots. Clearing a level on shot N awards `(6 - N) * 100` points.
- Optional collectible stars in some levels: +50 each, only counted on the clearing shot.
- Using all 5 shots without hitting the target ends the run.
- Final score = sum across cleared levels. Submitted to the leaderboard with a 3–12 character name.

## Controls

- Click and drag backward from the launcher to aim (direction = opposite of drag, power = drag length, clamped to a max).
- While dragging, show a dotted preview line of only the first ~15% of the trajectory. Never show the full path.
- Release to fire. Input is disabled while a probe is in flight.
- `R` restarts the current level's shot (costs a shot only if fired). `Esc` pauses.
- Touch should work the same as mouse.

## Physics spec (`shared/physics.js`)

Must be fully deterministic so the server can re-simulate any shot and get the identical result.

- Fixed timestep: `DT = 1/120` seconds. Never use frame delta time for simulation.
- Max simulation steps per shot: 120 * 20 (20 seconds). Exceeding it = miss.
- Simulation is 2D (x, z plane). Rendering is 3D with the camera angled down; planets are spheres sitting on the plane.
- Each body has `{ x, z, radius, mass, kind }` where kind is `planet`, `blackhole`, or `repeller`.
- Acceleration on the probe from each body: `a = G * mass / max(d², minD²)` directed toward the body (away from it for `repeller`). Use a softening `minD` to avoid singularities.
- Moving bodies: position is a pure function of simulation time, e.g. circular orbit `x = cx + r*cos(ω t + φ)`. No accumulated state.
- Collision: probe hits a body if distance < body.radius + probe radius → crash. Black holes also have an event-horizon radius larger than their visual radius.
- Target: a gate segment or circle; hitting it = success. Stars: circles collected on contact.
- Out of bounds: leaving the level rectangle = miss.
- Integrator: semi-implicit (symplectic) Euler. Same order of operations on client and server.
- Export: `simulateShot(level, launch) → { result: 'hit'|'crash'|'miss', steps, starsCollected, path }` where `path` is downsampled for rendering.
- Inputs `launch = { angle, power, releaseTime }` are quantized (angle to 0.1°, power to 0.01, releaseTime to whole simulation steps) before simulating, on both sides.

## Levels

Defined only in `worker/src/levels.js`. Progression:
1. One planet, obvious curve.
2. Target behind a planet; must bend around it.
3. Two planets pulling against each other.
4. First black hole.
5. Narrow gap between two bodies, with a star inside it.
6. First repeller.
7. One orbiting planet (timing matters via `releaseTime`).
8. Mix of everything.

Each level: `{ id, bounds, launcher, target, bodies, stars, par }`.

## Anti-cheat / server-authoritative design

The client is untrusted. Assume a coding agent will read every client file.

- `POST /api/run/start` → creates a run in D1, returns `runId` and level 1 definition. Levels are delivered one at a time, only after the previous level is cleared.
- `POST /api/run/shot` with `{ runId, levelId, launch }` → server quantizes, calls `simulateShot`, updates shots used and score in D1, returns the result and path. The client animates the server's path, not its own.
- The client may run `simulateShot` locally only for the short aim preview.
- `POST /api/run/finish` with `{ runId, name }` → writes the server-computed score to the leaderboard. The client never sends a score.
- `GET /api/leaderboard` → top 20.
- Rate limit: max 1 shot per 1.5 seconds per run; reject faster requests. Runs expire after 30 minutes idle.
- Reject shots for levels not yet unlocked, after a run ended, or exceeding 5 per level.
- Hidden per-run variation: a secret seed per run (D1 only) nudges body masses 5–12% server-side (`worker/src/variation.js`). The client sees only nominal values.
- No game state on `window`. Keep state inside module closures. Production build is minified.

## Visual style

- Dark background with a procedural starfield (Points, a few thousand stars, slight parallax).
- Planets: emissive spheres in distinct colors; black holes as dark spheres with a glowing accretion ring; repellers with a pulsing outer shell.
- Probe: small bright sphere with a fading trail (line with per-vertex alpha).
- Previous shots in the current level remain as faint ghost trails.
- Target: glowing ring that pulses. Stars: small spinning icosahedrons.
- Bloom on, moderate strength. Keep 60fps on a laptop.
- HUD is a DOM overlay, minimal: level, shots left, score.

## Screens / state machine

`menu → playing → (levelClear → playing)* → gameOver → leaderboard`

Menu shows title, a "How to play" panel, Start, and Leaderboard buttons.

## Milestones (build in this order, verify each before moving on)

1. Vite project renders a starfield and one sphere with bloom.
2. `shared/physics.js` with unit tests proving determinism (same input → identical output, run twice).
3. Drag-to-aim input with preview line; local simulation animates a shot.
4. Level loading, collisions, target hit, shot counting, scoring — all local first.
5. Worker + D1: run start, shot validation, finish, leaderboard. Switch client to server-driven results.
6. All 8 levels, ghost trails, HUD polish, menu and game over screens.
7. README with player instructions; deploy the Worker (which also serves the client).

## Coding conventions

- Small, focused modules. No file over ~300 lines.
- Comments explain *why*, especially in physics and anti-cheat code, since I need to explain the design in class.
- No external assets requiring network fetches beyond npm packages; generate geometry procedurally.
- Constants (G, DT, max power, shot limit) live in one config object in `shared/physics.js`.

## Testing

- `shared/physics.js`: determinism test, a known-hit test per level (store one valid solution per level for testing only, in the worker test folder, never shipped to the client).
- Worker: tests for rejected forged requests (wrong level, too many shots, too fast, finished run).
- Manually play every level after any physics change; adjust level layouts if a level becomes impossible.

## Commands

```
# tests (repo root, no install needed)
npm test

# level difficulty / solutions
node worker/scripts/solve.js [levelNumber]

# client
cd client && npm install && npm run dev

# worker (also builds and serves the client at :8787)
cd worker && npm install
npx wrangler d1 execute slingshot-db --local --file=schema.sql
npm run dev

# deploy (builds client, deploys Worker + static assets to one URL)
cd worker && npm run deploy
```

## Don'ts

- Don't add a physics engine or UI framework.
- Don't trust or accept any score, result, or level-complete flag from the client.
- Don't show the full trajectory preview.
- Don't expand scope (no multiplayer, accounts, sound design rabbit holes) until all milestones are done.
