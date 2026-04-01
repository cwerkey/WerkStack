'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const CATEGORIES = [
  'infrastructure', 'storage', 'networking', 'os',
  'topology', 'docs', 'activity', 'settings',
];

const PermissionEntrySchema = z.object({
  category: z.enum(CATEGORIES),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  canExecute: z.boolean(),
});

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  permissions: z.array(PermissionEntrySchema).min(1),
});

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  permissions: z.array(PermissionEntrySchema).min(1),
});

const AddUserSchema = z.object({
  userId: z.string().uuid(),
});

async function withOrg(db, orgId, fn) {
  const client = await db.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Seed default "Admin" and "Viewer" groups for a site if none exist.
 */
async function seedDefaults(client, orgId, siteId) {
  // Admin group — full R/W/X on all categories
  const adminRes = await client.query(
    `INSERT INTO security_groups (org_id, site_id, name, description, is_default)
     VALUES ($1, $2, 'Admin', 'Full access to all categories', true)
     RETURNING id`,
    [orgId, siteId]
  );
  const adminId = adminRes.rows[0].id;
  for (const cat of CATEGORIES) {
    await client.query(
      `INSERT INTO security_group_permissions (group_id, category, can_read, can_write, can_execute)
       VALUES ($1, $2, true, true, true)`,
      [adminId, cat]
    );
  }

  // Viewer group — read-only on all categories
  const viewerRes = await client.query(
    `INSERT INTO security_groups (org_id, site_id, name, description, is_default)
     VALUES ($1, $2, 'Viewer', 'Read-only access to all categories', true)
     RETURNING id`,
    [orgId, siteId]
  );
  const viewerId = viewerRes.rows[0].id;
  for (const cat of CATEGORIES) {
    await client.query(
      `INSERT INTO security_group_permissions (group_id, category, can_read, can_write, can_execute)
       VALUES ($1, $2, true, false, false)`,
      [viewerId, cat]
    );
  }
}

function toGroup(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    siteId: row.site_id,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

function toPermission(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    category: row.category,
    canRead: row.can_read,
    canWrite: row.can_write,
    canExecute: row.can_execute,
  };
}

module.exports = function rbacRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth, requireSiteAccess(db));

  // ── GET / — list security groups with permissions ────────────────────────────
  router.get('/', requireRole('viewer'), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;

    try {
      const groups = await withOrg(db, orgId, async (client) => {
        // Check if any groups exist; seed if not
        const countRes = await client.query(
          `SELECT count(*)::int AS cnt FROM security_groups WHERE site_id = $1`,
          [siteId]
        );
        if (countRes.rows[0].cnt === 0) {
          await seedDefaults(client, orgId, siteId);
        }

        const groupsRes = await client.query(
          `SELECT id, org_id, site_id, name, description, is_default, created_at
           FROM security_groups WHERE site_id = $1 ORDER BY is_default DESC, name`,
          [siteId]
        );

        const result = [];
        for (const row of groupsRes.rows) {
          const permsRes = await client.query(
            `SELECT id, group_id, category, can_read, can_write, can_execute
             FROM security_group_permissions WHERE group_id = $1 ORDER BY category`,
            [row.id]
          );
          const userCountRes = await client.query(
            `SELECT count(*)::int AS cnt FROM user_site_permissions WHERE security_group_id = $1 AND site_id = $2`,
            [row.id, siteId]
          );
          result.push({
            ...toGroup(row),
            permissions: permsRes.rows.map(toPermission),
            userCount: userCountRes.rows[0].cnt,
          });
        }
        return result;
      });

      res.json(groups);
    } catch (err) {
      console.error('[GET /security-groups]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── POST / — create security group ──────────────────────────────────────────
  router.post('/', requireRole('admin'), validate(CreateGroupSchema), async (req, res) => {
    const { orgId } = req.user;
    const { siteId } = req.params;
    const { name, description, permissions } = req.body;

    try {
      const group = await withOrg(db, orgId, async (client) => {
        await client.query('BEGIN');

        const groupRes = await client.query(
          `INSERT INTO security_groups (org_id, site_id, name, description)
           VALUES ($1, $2, $3, $4)
           RETURNING id, org_id, site_id, name, description, is_default, created_at`,
          [orgId, siteId, name, description || null]
        );
        const group = toGroup(groupRes.rows[0]);

        const perms = [];
        for (const p of permissions) {
          const permRes = await client.query(
            `INSERT INTO security_group_permissions (group_id, category, can_read, can_write, can_execute)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, group_id, category, can_read, can_write, can_execute`,
            [group.id, p.category, p.canRead, p.canWrite, p.canExecute]
          );
          perms.push(toPermission(permRes.rows[0]));
        }

        await client.query('COMMIT');
        return { ...group, permissions: perms, userCount: 0 };
      });

      res.status(201).json(group);
    } catch (err) {
      console.error('[POST /security-groups]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── PUT /:groupId — update security group ──────────────────────────────────
  router.put('/:groupId', requireRole('admin'), validate(UpdateGroupSchema), async (req, res) => {
    const { orgId } = req.user;
    const { siteId, groupId } = req.params;
    const { name, description, permissions } = req.body;

    try {
      const group = await withOrg(db, orgId, async (client) => {
        // Verify group exists and belongs to site
        const existing = await client.query(
          `SELECT id, name, is_default FROM security_groups WHERE id = $1 AND site_id = $2`,
          [groupId, siteId]
        );
        if (existing.rows.length === 0) {
          return null;
        }

        const isDefault = existing.rows[0].is_default;

        await client.query('BEGIN');

        // Update group metadata (prevent renaming default groups)
        const updatedName = isDefault ? existing.rows[0].name : (name || existing.rows[0].name);
        const updatedDesc = description !== undefined ? description : null;

        await client.query(
          `UPDATE security_groups SET name = $1, description = $2 WHERE id = $3`,
          [updatedName, updatedDesc, groupId]
        );

        // Replace permissions
        await client.query(`DELETE FROM security_group_permissions WHERE group_id = $1`, [groupId]);

        const perms = [];
        for (const p of permissions) {
          const permRes = await client.query(
            `INSERT INTO security_group_permissions (group_id, category, can_read, can_write, can_execute)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, group_id, category, can_read, can_write, can_execute`,
            [groupId, p.category, p.canRead, p.canWrite, p.canExecute]
          );
          perms.push(toPermission(permRes.rows[0]));
        }

        await client.query('COMMIT');

        const groupRes = await client.query(
          `SELECT id, org_id, site_id, name, description, is_default, created_at
           FROM security_groups WHERE id = $1`,
          [groupId]
        );
        const userCountRes = await client.query(
          `SELECT count(*)::int AS cnt FROM user_site_permissions WHERE security_group_id = $1 AND site_id = $2`,
          [groupId, siteId]
        );

        return {
          ...toGroup(groupRes.rows[0]),
          permissions: perms,
          userCount: userCountRes.rows[0].cnt,
        };
      });

      if (!group) return res.status(404).json({ error: 'security group not found' });
      res.json(group);
    } catch (err) {
      console.error('[PUT /security-groups/:groupId]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── DELETE /:groupId — delete security group ────────────────────────────────
  router.delete('/:groupId', requireRole('admin'), async (req, res) => {
    const { orgId } = req.user;
    const { siteId, groupId } = req.params;

    try {
      await withOrg(db, orgId, async (client) => {
        const existing = await client.query(
          `SELECT id FROM security_groups WHERE id = $1 AND site_id = $2`,
          [groupId, siteId]
        );
        if (existing.rows.length === 0) {
          return res.status(404).json({ error: 'security group not found' });
        }

        // Prevent deleting the last group that has full settings access
        const adminGroupsRes = await client.query(
          `SELECT sg.id
           FROM security_groups sg
           JOIN security_group_permissions sgp ON sgp.group_id = sg.id
           WHERE sg.site_id = $1
             AND sgp.category = 'settings'
             AND sgp.can_read = true
             AND sgp.can_write = true
             AND sg.id != $2`,
          [siteId, groupId]
        );
        if (adminGroupsRes.rows.length === 0) {
          // Check if the group being deleted has settings R+W
          const selfPerms = await client.query(
            `SELECT 1 FROM security_group_permissions
             WHERE group_id = $1 AND category = 'settings' AND can_read = true AND can_write = true`,
            [groupId]
          );
          if (selfPerms.rows.length > 0) {
            return res.status(400).json({ error: 'cannot delete the last group with full settings access' });
          }
        }

        await client.query(`DELETE FROM security_groups WHERE id = $1`, [groupId]);
        res.status(204).end();
      });
    } catch (err) {
      console.error('[DELETE /security-groups/:groupId]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── GET /:groupId/users — list users in a security group ────────────────────
  router.get('/:groupId/users', requireRole('viewer'), async (req, res) => {
    const { orgId } = req.user;
    const { siteId, groupId } = req.params;

    try {
      const users = await withOrg(db, orgId, async (client) => {
        const result = await client.query(
          `SELECT u.id, u.org_id, u.email, u.username, u.role, u.created_at, usp.created_at AS assigned_at
           FROM user_site_permissions usp
           JOIN users u ON u.id = usp.user_id
           WHERE usp.security_group_id = $1 AND usp.site_id = $2
           ORDER BY u.username`,
          [groupId, siteId]
        );
        return result.rows.map((row) => ({
          id: row.id,
          orgId: row.org_id,
          email: row.email,
          username: row.username,
          role: row.role,
          createdAt: row.created_at,
          assignedAt: row.assigned_at,
        }));
      });

      res.json(users);
    } catch (err) {
      console.error('[GET /security-groups/:groupId/users]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── POST /:groupId/users — add user to security group ──────────────────────
  router.post('/:groupId/users', requireRole('admin'), validate(AddUserSchema), async (req, res) => {
    const { orgId } = req.user;
    const { siteId, groupId } = req.params;
    const { userId } = req.body;

    try {
      const assignment = await withOrg(db, orgId, async (client) => {
        // Verify the group belongs to this site
        const groupCheck = await client.query(
          `SELECT id FROM security_groups WHERE id = $1 AND site_id = $2`,
          [groupId, siteId]
        );
        if (groupCheck.rows.length === 0) {
          return { error: 'security group not found', status: 404 };
        }

        // Verify the user belongs to this org
        const userCheck = await client.query(
          `SELECT id FROM users WHERE id = $1 AND org_id = $2`,
          [userId, orgId]
        );
        if (userCheck.rows.length === 0) {
          return { error: 'user not found', status: 404 };
        }

        const result = await client.query(
          `INSERT INTO user_site_permissions (user_id, site_id, security_group_id, org_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, site_id, security_group_id) DO NOTHING
           RETURNING id, user_id, site_id, security_group_id, org_id, created_at`,
          [userId, siteId, groupId, orgId]
        );

        if (result.rows.length === 0) {
          return { error: 'user already in this group', status: 409 };
        }

        return {
          id: result.rows[0].id,
          userId: result.rows[0].user_id,
          siteId: result.rows[0].site_id,
          securityGroupId: result.rows[0].security_group_id,
          createdAt: result.rows[0].created_at,
        };
      });

      if (assignment.error) {
        return res.status(assignment.status).json({ error: assignment.error });
      }

      res.status(201).json(assignment);
    } catch (err) {
      console.error('[POST /security-groups/:groupId/users]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── DELETE /:groupId/users/:userId — remove user from group ─────────────────
  router.delete('/:groupId/users/:userId', requireRole('admin'), async (req, res) => {
    const { orgId } = req.user;
    const { siteId, groupId, userId } = req.params;

    try {
      await withOrg(db, orgId, async (client) => {
        const result = await client.query(
          `DELETE FROM user_site_permissions
           WHERE user_id = $1 AND site_id = $2 AND security_group_id = $3
           RETURNING id`,
          [userId, siteId, groupId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'assignment not found' });
        }
        res.status(204).end();
      });
    } catch (err) {
      console.error('[DELETE /security-groups/:groupId/users/:userId]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── GET /me/permissions — current user's resolved permissions ───────────────
  router.get('/me/permissions', requireRole('viewer'), async (req, res) => {
    const { orgId, userId } = req.user;
    const { siteId } = req.params;

    try {
      const permissions = await withOrg(db, orgId, async (client) => {
        const result = await client.query(
          `SELECT sgp.category,
                  bool_or(sgp.can_read) AS can_read,
                  bool_or(sgp.can_write) AS can_write,
                  bool_or(sgp.can_execute) AS can_execute
           FROM user_site_permissions usp
           JOIN security_group_permissions sgp ON sgp.group_id = usp.security_group_id
           WHERE usp.user_id = $1 AND usp.site_id = $2
           GROUP BY sgp.category`,
          [userId, siteId]
        );

        const perms = {};
        for (const cat of CATEGORIES) {
          perms[cat] = { canRead: false, canWrite: false, canExecute: false };
        }
        for (const row of result.rows) {
          perms[row.category] = {
            canRead: row.can_read,
            canWrite: row.can_write,
            canExecute: row.can_execute,
          };
        }
        return perms;
      });

      res.json(permissions);
    } catch (err) {
      console.error('[GET /security-groups/me/permissions]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── GET /users/:userId/permissions — resolved permissions for a specific user
  router.get('/users/:userId/permissions', requireRole('admin'), async (req, res) => {
    const { orgId } = req.user;
    const { siteId, userId } = req.params;

    try {
      const permissions = await withOrg(db, orgId, async (client) => {
        const result = await client.query(
          `SELECT sgp.category,
                  bool_or(sgp.can_read) AS can_read,
                  bool_or(sgp.can_write) AS can_write,
                  bool_or(sgp.can_execute) AS can_execute
           FROM user_site_permissions usp
           JOIN security_group_permissions sgp ON sgp.group_id = usp.security_group_id
           WHERE usp.user_id = $1 AND usp.site_id = $2
           GROUP BY sgp.category`,
          [userId, siteId]
        );

        const perms = {};
        for (const cat of CATEGORIES) {
          perms[cat] = { canRead: false, canWrite: false, canExecute: false };
        }
        for (const row of result.rows) {
          perms[row.category] = {
            canRead: row.can_read,
            canWrite: row.can_write,
            canExecute: row.can_execute,
          };
        }
        return perms;
      });

      res.json(permissions);
    } catch (err) {
      console.error('[GET /security-groups/users/:userId/permissions]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
