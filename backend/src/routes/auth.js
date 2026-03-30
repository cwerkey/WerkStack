'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const { z }    = require('zod');
const { validate }          = require('../middleware/validate');
const { requireAuth, signToken, setSessionCookie, clearSessionCookie } = require('../middleware/auth');

const LoginSchema    = z.object({ email: z.string().email(), password: z.string().min(1) });
const RegisterSchema = z.object({
  email:    z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  orgName:  z.string().min(1).max(100),
});

// Derive a URL-safe slug from an org name.
// e.g. "Acme Corp!" → "acme-corp"
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'org';
}

// Append a numeric suffix until the slug is unique.
// Returns the unique slug string.
async function uniqueSlug(client, base) {
  let slug     = base;
  let attempt  = 0;
  while (true) {
    const { rows } = await client.query(
      `SELECT id FROM organizations WHERE slug = $1`,
      [slug]
    );
    if (rows.length === 0) return slug;
    attempt += 1;
    slug = `${base}-${attempt}`;
  }
}

module.exports = function authRoutes(db) {
  const router = express.Router();

  router.get('/me', requireAuth, async (req, res) => {
    try {
      const userResult = await db.query(
        `SELECT id, org_id, email, username, role, created_at FROM users WHERE id = $1`,
        [req.user.userId]
      );
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'user not found' });
      }
      const u = userResult.rows[0];

      const orgResult = await db.query(
        `SELECT id, name, slug, created_at FROM organizations WHERE id = $1`,
        [u.org_id]
      );
      const org = orgResult.rows[0];

      const sitesResult = await db.query(
        `SELECT id, org_id, name, location, color, description, created_at
           FROM sites WHERE org_id = $1 ORDER BY created_at`,
        [u.org_id]
      );

      res.json({
        user: {
          id:        u.id,
          orgId:     u.org_id,
          email:     u.email,
          username:  u.username,
          role:      u.role,
          createdAt: u.created_at,
        },
        org: org
          ? { id: org.id, name: org.name, slug: org.slug, createdAt: org.created_at }
          : null,
        sites: sitesResult.rows.map(s => ({
          id:          s.id,
          orgId:       s.org_id,
          name:        s.name,
          location:    s.location,
          color:       s.color,
          description: s.description,
          createdAt:   s.created_at,
        })),
      });
    } catch (err) {
      console.error('[GET /api/auth/me]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post('/login', validate(LoginSchema), async (req, res) => {
    const { email, password } = req.body;
    try {
      const result = await db.query(
        `SELECT id, org_id, email, username, role, password_hash FROM users WHERE email = $1`,
        [email]
      );
      const user = result.rows[0];
      if (!user) return res.status(401).json({ error: 'invalid email or password' });

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'invalid email or password' });

      const token = signToken({ userId: user.id, orgId: user.org_id, role: user.role });
      setSessionCookie(res, token);
      res.json({
        user: {
          id:       user.id,
          orgId:    user.org_id,
          email:    user.email,
          username: user.username,
          role:     user.role,
        },
      });
    } catch (err) {
      console.error('[POST /api/auth/login]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post('/register', validate(RegisterSchema), async (req, res) => {
    const { email, username, password, orgName } = req.body;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const hash    = await bcrypt.hash(password, 12);
      const baseSlug = slugify(orgName);
      const slug     = await uniqueSlug(client, baseSlug);

      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id, name, slug, created_at`,
        [orgName, slug]
      );
      const org = orgResult.rows[0];

      const userResult = await client.query(
        `INSERT INTO users (org_id, email, username, password_hash, role)
         VALUES ($1, $2, $3, $4, 'owner')
         RETURNING id, created_at`,
        [org.id, email, username, hash]
      );
      const user = userResult.rows[0];

      await client.query(
        `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [org.id, user.id]
      );

      await client.query('COMMIT');

      const token = signToken({ userId: user.id, orgId: org.id, role: 'owner' });
      setSessionCookie(res, token);

      res.status(201).json({
        user: {
          id:        user.id,
          orgId:     org.id,
          email,
          username,
          role:      'owner',
          createdAt: user.created_at,
        },
        org: {
          id:        org.id,
          name:      org.name,
          slug:      org.slug,
          createdAt: org.created_at,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ error: 'email already in use' });
      console.error('[POST /api/auth/register]', err);
      res.status(500).json({ error: 'server error' });
    } finally {
      client.release();
    }
  });

  router.post('/logout', (req, res) => {
    clearSessionCookie(res);
    res.status(204).send();
  });

  return router;
};
