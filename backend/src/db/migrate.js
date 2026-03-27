'use strict';

const fs   = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * migrate — applies any unapplied SQL migrations in order.
 *
 * Migrations are plain .sql files in db/migrations/, named with a numeric
 * prefix (e.g. 001_initial.sql). They are applied in lexicographic order.
 * Each applied migration is recorded in schema_migrations so it is only
 * ever run once.
 *
 * @param {import('pg').Pool} db
 */
async function migrate(db) {
  // Ensure the tracking table exists (idempotent)
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Fetch already-applied versions
  const { rows } = await db.query(
    `SELECT version FROM schema_migrations ORDER BY version`
  );
  const applied = new Set(rows.map(r => r.version));

  // Read migration files sorted lexicographically
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue; // already applied
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    console.log(`[migrate] applying ${file} …`);

    // Run migration + record in a single transaction
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (version) VALUES ($1)`,
        [file]
      );
      await client.query('COMMIT');
      console.log(`[migrate] ✓ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ✗ ${file}:`, err.message);
      throw err; // halt startup — schema must be consistent
    } finally {
      client.release();
    }
  }
}

module.exports = { migrate };
