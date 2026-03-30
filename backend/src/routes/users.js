'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const { z }    = require('zod');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const InviteSchema = z.object({
  email:    z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  role:     z.enum(['viewer', 'member', 'admin']).default('member'),
});

const RoleSchema = z.object({
  role: z.enum(['viewer', 'member', 'admin']),
});

function toUser(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    email:     row.email,
    username:  row.username,
    role:      row.role,
    createdAt: row.created_at,
  };
}

module.exports = function usersRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const { orgId } = req.user;
    try {
      const result = await db.query(
        `SELECT id, org_id, email, username, role, created_at
         FROM users WHERE org_id = $1 ORDER BY created_at`,
        [orgId]
      );
      res.json(result.rows.map(toUser));
    } catch (err) {
      console.error('[GET /org/users]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post('/', requireRole('admin'), validate(InviteSchema), async (req, res) => {
    const { orgId }                        = req.user;
    const { email, username, password, role } = req.body;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const hash = await bcrypt.hash(password, 12);
      const result = await client.query(
        `INSERT INTO users (org_id, email, username, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, org_id, email, username, role, created_at`,
        [orgId, email, username, hash, role]
      );
      await client.query(
        `INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)`,
        [orgId, result.rows[0].id, role]
      );
      await client.query('COMMIT');
      res.status(201).json(toUser(result.rows[0]));
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ error: 'email already in use' });
      console.error('[POST /org/users]', err);
      res.status(500).json({ error: 'server error' });
    } finally {
      client.release();
    }
  });

  router.patch('/:id/role', requireRole('admin'), validate(RoleSchema), async (req, res) => {
    const { orgId, userId: currentUserId, role: currentRole } = req.user;
    const { id }      = req.params;
    const { role: newRole } = req.body;

    if (id === currentUserId) {
      return res.status(400).json({ error: 'cannot change your own role' });
    }

    try {
      const targetRes = await db.query(
        `SELECT role FROM users WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      if (targetRes.rows.length === 0) return res.status(404).json({ error: 'user not found' });

      const targetRole = targetRes.rows[0].role;
      if (targetRole === 'owner') {
        return res.status(403).json({ error: 'cannot change the owner\'s role' });
      }
      if (newRole === 'owner' && currentRole !== 'owner') {
        return res.status(403).json({ error: 'only the owner can grant owner role' });
      }

      const result = await db.query(
        `UPDATE users SET role = $1
         WHERE id = $2 AND org_id = $3
         RETURNING id, org_id, email, username, role, created_at`,
        [newRole, id, orgId]
      );
      await db.query(
        `UPDATE memberships SET role = $1 WHERE user_id = $2 AND org_id = $3`,
        [newRole, id, orgId]
      );
      res.json(toUser(result.rows[0]));
    } catch (err) {
      console.error('[PATCH /org/users/:id/role]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const { orgId, userId: currentUserId, role: currentRole } = req.user;
    const { id } = req.params;

    if (id === currentUserId) {
      return res.status(400).json({ error: 'cannot remove yourself' });
    }

    try {
      const targetRes = await db.query(
        `SELECT role FROM users WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      if (targetRes.rows.length === 0) return res.status(404).json({ error: 'user not found' });
      if (targetRes.rows[0].role === 'owner' && currentRole !== 'owner') {
        return res.status(403).json({ error: 'cannot remove the owner' });
      }

      await db.query(`DELETE FROM users WHERE id = $1 AND org_id = $2`, [id, orgId]);
      res.status(204).end();
    } catch (err) {
      console.error('[DELETE /org/users/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
