# Gravity Slingshot

Launch a probe through a field of planets and bend its path with gravity to hit the green ring.

https://gravity-slingshot.gravity-slingshot.workers.dev 

## How to play

1. **Press** on the blue launcher and **pull back**, like a slingshot. The shot goes the opposite way from your pull.
2. Pull further for more power. The dotted line shows only the **start** of your path.
3. **Release** to fire. After that, gravity takes over.

| Thing | What it does |
|---|---|
| Planets | Pull you in. Touch one and you crash. |
| Black holes | Pull very hard. You're swallowed at the orange event-horizon ring, which is bigger than the black sphere. |
| Repellers (pink, pulsing) | Push you away. |
| Stars | +50 each, but only if you collect them on the shot that hits the target. |
| Orbiting planets | Move on a fixed clock, so *when* you release matters. |

- You get **5 shots per level**. Clearing on shot N scores `(6 − N) × 100` (500 for a first-shot hit).
- Faint lines show your earlier tries on the current level. Use them to adjust.
- Miss all 5 and the run ends. Enter a 3–12 character name to post your score.
- Keys: `R` cancels your aim or skips the flight animation (a shot you already fired still counts), `Space` (hold) fast-forwards, `Esc` pauses.
- Touch works the same as mouse.

## Running locally

Requires Node 22+.

```bash
cd client && npm install && cd ../worker && npm install
npx wrangler d1 execute slingshot-db --local --file=schema.sql   # once
```

**Play the production build** (what gets deployed): one server, game and API together.

```bash
cd worker && npm run dev            # builds the client, serves http://localhost:8787
```

**Develop with hot reload:** run the line above in one terminal, plus this in a second terminal:

```bash
cd client && npm run dev            # http://localhost:5173, proxies /api to :8787
```

Tests (no install needed; they use Node's built-in test runner and `node:sqlite`):

```bash
npm test                            # from the repo root
```

## Deploying to Cloudflare (free tier)

A single Worker serves both the game (static files from `client/dist`) and the API, so there's one URL.

```bash
cd worker
npx wrangler login                                  # once, opens a browser
npx wrangler d1 create slingshot-db                 # paste the printed database_id into wrangler.toml
npx wrangler d1 execute slingshot-db --remote --file=schema.sql
npm run deploy                                      # builds the client and deploys
```

The game is then live at `https://gravity-slingshot.<your-subdomain>.workers.dev`. This one is live at https://gravity-slingshot.gravity-slingshot.workers.dev

## How it works

```
client/   Vite + Three.js. Renders, takes input, animates paths the server returns
          (built to client/dist and served by the Worker as static assets)
shared/   physics.js: deterministic simulation, used by both client and Worker
worker/   Cloudflare Worker + D1: runs, shot validation, scoring, leaderboard
```

### Deterministic physics (`shared/physics.js`)

- Fixed timestep `DT = 1/120 s`, at most 2400 steps (20 s) per shot.
- Gravity: `a = G·m / max(d², minD²)` toward each body (away from repellers). The softening distance `minD` keeps acceleration finite near a body's center.
- Semi-implicit Euler: update velocity first, then position using the new velocity. It conserves energy much better than plain Euler, so orbits don't spiral outward.
- Orbiting bodies' positions are a pure function of time (`cx + r·cos(ωt + φ)`), so the simulation keeps no hidden state.
- Inputs are quantized to integers (angle in 0.1° steps, power in 0.01 steps, release time in whole steps) before simulating. The same launch always gives the bit-identical result, and the server stores exact values.
- Collisions test the segment the probe moved along during each step, not only its endpoint, so a fast probe can't tunnel through a small target.

### Anti-cheat: the server is authoritative

The client is treated as untrusted, and we assume a coding agent will read all of it.

- The client sends only **inputs**: `{ angle, power, releaseTime }`. The Worker quantizes them, runs `simulateShot` itself, and returns the result and path. The client animates the server's path.
- Scores, hit results and "level cleared" flags from the client are ignored. The leaderboard score is read from the server's `runs` row.
- Levels are sent one at a time, only after the server has seen the previous one cleared.
- The server rejects shots for locked or already-cleared levels, a 6th shot, shots after the run ended, shots less than 1.5 s apart, and runs idle for more than 30 minutes.
- Each write uses optimistic concurrency (`UPDATE … WHERE version = ?`), so racing duplicate requests can apply only once. This also makes the rate limit race-proof.
- Every accepted shot is logged in the `shots` table, so a suspicious run can be replayed later.
- **Hidden per-run variation** (`worker/src/variation.js`): each run gets a secret seed, stored only in D1. The server nudges every body's mass by 5–12% and simulates shots against those hidden values, while the client sees the nominal masses. `VARIATION=off` disables it (tests only).
- The client keeps no game state on `window`, and the production build is minified with no source maps.

**Tested against real AI agents.** A browser agent playing from screenshots scored 2,100 (6 of 8 levels). A coding agent that read the site's JavaScript, extracted the physics and solved levels offline scored 4,250 of 4,300 in about 7 minutes. All of its shots were legitimate.

**What this does *not* stop:** the level and the physics have to reach the client so it can draw and preview them. A determined coding agent could copy `physics.js`, search for a solution offline, and then submit real shots. The server guarantees that every score comes from real shots that obey the rules. It cannot prove a human chose them. The 15% preview, the rate limit, the 5-shot cap and the per-level reveal make bots slower and blind them to later levels, but they don't make bots impossible. The hidden variation doesn't change that much either. `node worker/scripts/variation-check.js` shows every level still has a fast, nearly straight shot that hits whatever the hidden masses are. Masses barely matter to a probe that spends little time near any planet. A fully observable, deterministic game can be solved by a coding agent. Making that genuinely hard would need levels where every route depends strongly on the hidden values.

### Level tooling

`node worker/scripts/solve.js [level]` grid-searches each level. It reports the share of launches that hit (a rough difficulty measure) and prints one solution per level. Those solutions live in `worker/test/solutions.js`, are used only by tests, and are never shipped to the client. Rerun it after any physics or level change.
