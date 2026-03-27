'use strict';

// Seed script — creates a test user via direct DB insertion.
// Usage: node backend/src/db/seed.js
// Requires: DATABASE_URL or defaults to local dev credentials.

const bcrypt = require('bcryptjs');
const { getDb } = require('./index');
const { migrate } = require('./migrate');

const TEST_USER = {
  email:    'admin@werkstack.dev',
  username: 'admin',
  password: 'werkstack123',
  orgName:  'WerkStack Lab',
};

async function seed() {
  const db = getDb();

  // Verify connection
  await db.query('SELECT 1');
  console.log('[seed] connected to database');

  // Run migrations first
  await migrate(db);
  console.log('[seed] migrations applied');

  const client = await db.connect();
  try {
    // Check if user already exists
    const existing = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [TEST_USER.email]
    );
    if (existing.rows.length > 0) {
      console.log('[seed] test user already exists — skipping');
      console.log('');
      console.log('╔══════════════════════════════════════════╗');
      console.log('║  Test User Credentials                   ║');
      console.log('╠══════════════════════════════════════════╣');
      console.log(`║  Email:    ${TEST_USER.email.padEnd(28)}║`);
      console.log(`║  Password: ${TEST_USER.password.padEnd(28)}║`);
      console.log('╚══════════════════════════════════════════╝');
      await db.end();
      return;
    }

    await client.query('BEGIN');

    // Create org
    const hash = await bcrypt.hash(TEST_USER.password, 12);
    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
      [TEST_USER.orgName, 'werkstack-lab']
    );
    const orgId = orgResult.rows[0].id;

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (org_id, email, username, password_hash, role)
       VALUES ($1, $2, $3, $4, 'owner')
       RETURNING id`,
      [orgId, TEST_USER.email, TEST_USER.username, hash]
    );
    const userId = userResult.rows[0].id;

    // Create membership
    await client.query(
      `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [orgId, userId]
    );

    // Create a sample site
    await client.query(
      `INSERT INTO sites (org_id, name, location, color, description)
       VALUES ($1, 'Home Lab', 'Basement', '#c47c5a', 'Primary homelab rack setup')`,
      [orgId]
    );

    await client.query('COMMIT');

    console.log('[seed] test user created successfully');
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  Test User Credentials                   ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Email:    ${TEST_USER.email.padEnd(28)}║`);
    console.log(`║  Password: ${TEST_USER.password.padEnd(28)}║`);
    console.log('╚══════════════════════════════════════════╝');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] error:', err.message);
    throw err;
  } finally {
    client.release();
    await db.end();
  }
}

seed().catch(err => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
