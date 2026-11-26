// Minimal stand-in for Cloudflare D1 backed by node:sqlite, so tests run the
// real schema and SQL without wrangler/miniflare. Only implements the D1
// methods the Worker uses: prepare().bind().first()/run()/all().
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function createFakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: (sql) => stmt(sql), _raw: db };
}
