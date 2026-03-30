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

module.exports = { getDb };
