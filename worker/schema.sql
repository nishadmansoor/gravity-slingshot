-- One row per run. All score/progress fields are written only by the Worker.
-- `version` is bumped on every write so concurrent requests can't both apply
-- (optimistic concurrency: UPDATE ... WHERE version = ?).
CREATE TABLE IF NOT EXISTS runs (
  id             TEXT PRIMARY KEY,
  status         TEXT    NOT NULL DEFAULT 'active', -- active | over | complete | expired
  level_index    INTEGER NOT NULL DEFAULT 0,        -- current (unlocked) level, 0-based
  shots_used     INTEGER NOT NULL DEFAULT 0,        -- shots fired on the current level
  score          INTEGER NOT NULL DEFAULT 0,
  levels_cleared INTEGER NOT NULL DEFAULT 0,
  submitted      INTEGER NOT NULL DEFAULT 0,        -- 1 once written to the leaderboard
  version        INTEGER NOT NULL DEFAULT 0,
  seed           INTEGER NOT NULL DEFAULT 0,        -- secret; drives hidden mass variation (variation.js)
  created_at     INTEGER NOT NULL,                  -- ms epoch
  updated_at     INTEGER NOT NULL,
  last_shot_at   INTEGER NOT NULL DEFAULT 0
);

-- Audit log of every accepted shot (quantized inputs + server result).
-- Lets you replay or inspect a suspicious run later.
CREATE TABLE IF NOT EXISTS shots (
  run_id       TEXT    NOT NULL,
  level_id     TEXT    NOT NULL,
  shot_no      INTEGER NOT NULL,
  angle_deci   INTEGER NOT NULL,
  power_centi  INTEGER NOT NULL,
  release_step INTEGER NOT NULL,
  result       TEXT    NOT NULL,
  stars        INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (run_id, level_id, shot_no)
);

CREATE TABLE IF NOT EXISTS leaderboard (
  run_id         TEXT PRIMARY KEY,                  -- one entry per run, ever
  name           TEXT    NOT NULL,
  score          INTEGER NOT NULL,
  levels_cleared INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leaderboard_score ON leaderboard (score DESC, created_at ASC);
