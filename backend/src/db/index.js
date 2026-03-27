'use strict';

const { Pool } = require('pg');

let pool;

function getDb() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://werkstack:werkstack_dev@localhost:5432/werkstack',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('[db] unexpected client error', err);
    });
  }
  return pool;
}

// Run a query with app.current_org_id set for RLS.
// All queries that touch tenant data should use this.
// Uses set_config() with parameterized value to avoid string interpolation.
async function queryWithOrg(db, orgId, text, params) {
  const client = await db.connect();
  try {
    // set_config(key, value, is_local) — is_local=true scopes to current transaction
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

module.exports = { getDb, queryWithOrg };
