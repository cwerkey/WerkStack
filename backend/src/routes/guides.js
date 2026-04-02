'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { guideLinkCrudRoutes } = require('./guide_links');

const GuideSchema = z.object({
  title:      z.string().min(1).max(200),
  content:    z.string().max(200000).default(''),
  manual_id:  z.string().uuid().optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
  is_shared:  z.boolean().optional(),
});

const GuidePatchSchema = z.object({
  title:      z.string().min(1).max(200).optional(),
  content:    z.string().max(200000).optional(),
  manual_id:  z.string().uuid().optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
  is_shared:  z.boolean().optional(),
});

const LockSchema = z.object({
  is_locked: z.boolean(),
});

const DuplicateSchema = z.object({
  mode: z.enum(['full', 'headers_only']),
});

function toGuide(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    title:     row.title,
    content:   row.content,
    manualId:  row.manual_id   ?? null,
    sortOrder: row.sort_order  ?? 0,
    isLocked:  row.is_locked   ?? false,
    isShared:  row.is_shared   ?? false,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    manualName: row.manual_name ?? null,
    links:      row._links ?? [],
  };
}

function toVersion(row) {
  return {
    id:         row.id,
    guideId:    row.guide_id,
    title:      row.title,
    editedBy:   row.edited_by,
    editedByName: row.edited_by_name ?? null,
    createdAt:  row.created_at,
  };
}

async function snapshotVersion(db, guideId, orgId, editedBy) {
  await db.query(
    `INSERT INTO guide_versions (org_id, guide_id, title, content, edited_by)
     SELECT org_id, id, title, content, $3
     FROM guides WHERE id = $1 AND org_id = $2`,
    [guideId, orgId, editedBy]
  );
}

module.exports = function guidesRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  router.use('/', guideLinkCrudRoutes(db));

  router.get('/', async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    try {
      const result = await db.query(
        `SELECT g.*,
                gm.name AS manual_name,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id',         gl.id,
                      'entityType', gl.entity_type,
                      'entityId',   gl.entity_id
                    )
                  ) FILTER (WHERE gl.id IS NOT NULL),
                  '[]'
                ) AS links
         FROM guides g
         LEFT JOIN guide_manuals gm ON gm.id = g.manual_id
         LEFT JOIN guide_links gl   ON gl.guide_id = g.id
         WHERE (g.site_id = $1 OR g.is_shared = true) AND g.org_id = $2
         GROUP BY g.id, gm.name
         ORDER BY g.sort_order ASC, g.updated_at DESC`,
        [siteId, orgId]
      );
      res.json(result.rows.map(row => ({
        ...toGuide(row),
        links: row.links || [],
      })));
    } catch (err) {
      console.error('[GET /guides]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post('/', validate(GuideSchema), async (req, res) => {
    const { siteId }                          = req.params;
    const { orgId, userId }                   = req.user;
    const { title, content, manual_id, sort_order, is_shared } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO guides (org_id, site_id, title, content, manual_id, sort_order, is_shared, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [orgId, siteId, title, content ?? '', manual_id ?? null, sort_order ?? 0, is_shared ?? false, userId]
      );
      res.status(201).json(toGuide(result.rows[0]));
    } catch (err) {
      console.error('[POST /guides]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.patch('/:id', validate(GuidePatchSchema), async (req, res) => {
    const { siteId, id }                               = req.params;
    const { orgId, userId }                            = req.user;
    const { title, content, manual_id, sort_order, is_shared } = req.body;

    try {
      const current = await db.query(
        `SELECT * FROM guides WHERE id = $1 AND site_id = $2 AND org_id = $3`,
        [id, siteId, orgId]
      );
      if (current.rows.length === 0) return res.status(404).json({ error: 'guide not found' });

      const guide = current.rows[0];
      const roleLevel = { viewer: 0, member: 1, admin: 2, owner: 3 };
      const userLevel = roleLevel[req.user?.role] ?? -1;

      if (guide.is_locked && userLevel < 2) {
        return res.status(403).json({ error: 'guide is locked' });
      }

      await snapshotVersion(db, id, orgId, userId);

      const sets   = ['updated_at = now()'];
      const values = [];
      let   i      = 1;
      if (title      !== undefined) { sets.push(`title = $${i++}`);      values.push(title); }
      if (content    !== undefined) { sets.push(`content = $${i++}`);    values.push(content); }
      if (manual_id  !== undefined) { sets.push(`manual_id = $${i++}`);  values.push(manual_id); }
      if (is_shared  !== undefined) { sets.push(`is_shared = $${i++}`);  values.push(is_shared); }
      if (sort_order !== undefined) { sets.push(`sort_order = $${i++}`); values.push(sort_order); }
      values.push(id, siteId, orgId);

      const result = await db.query(
        `UPDATE guides SET ${sets.join(', ')}
         WHERE id = $${i++} AND site_id = $${i++} AND org_id = $${i}
         RETURNING *`,
        values
      );
      res.json(toGuide(result.rows[0]));
    } catch (err) {
      console.error('[PATCH /guides/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.patch('/:id/lock', requireRole('admin'), validate(LockSchema), async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    const { is_locked }  = req.body;
    try {
      const result = await db.query(
        `UPDATE guides SET is_locked = $1, updated_at = now()
         WHERE id = $2 AND site_id = $3 AND org_id = $4
         RETURNING *`,
        [is_locked, id, siteId, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'guide not found' });
      res.json(toGuide(result.rows[0]));
    } catch (err) {
      console.error('[PATCH /guides/:id/lock]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post('/:id/duplicate', validate(DuplicateSchema), async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId, userId } = req.user;
    const { mode }       = req.body;
    try {
      const current = await db.query(
        `SELECT * FROM guides WHERE id = $1 AND site_id = $2 AND org_id = $3`,
        [id, siteId, orgId]
      );
      if (current.rows.length === 0) return res.status(404).json({ error: 'guide not found' });

      const source  = current.rows[0];
      let   content = source.content;

      if (mode === 'headers_only') {
        content = source.content
          .split('\n')
          .filter(line => /^#{1,3}\s/.test(line))
          .join('\n');
      }

      const result = await db.query(
        `INSERT INTO guides (org_id, site_id, title, content, manual_id, sort_order, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          orgId, siteId,
          `${source.title} (copy)`,
          content,
          source.manual_id,
          source.sort_order,
          userId,
        ]
      );
      res.status(201).json(toGuide(result.rows[0]));
    } catch (err) {
      console.error('[POST /guides/:id/duplicate]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.get('/:id/versions', async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    try {
      const check = await db.query(
        `SELECT id FROM guides WHERE id = $1 AND site_id = $2 AND org_id = $3`,
        [id, siteId, orgId]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: 'guide not found' });

      const result = await db.query(
        `SELECT gv.id, gv.guide_id, gv.title, gv.edited_by, gv.created_at,
                u.name AS edited_by_name
         FROM guide_versions gv
         LEFT JOIN users u ON u.id = gv.edited_by
         WHERE gv.guide_id = $1 AND gv.org_id = $2
         ORDER BY gv.created_at DESC`,
        [id, orgId]
      );
      res.json(result.rows.map(toVersion));
    } catch (err) {
      console.error('[GET /guides/:id/versions]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.get('/:id/versions/:versionId', async (req, res) => {
    const { siteId, id, versionId } = req.params;
    const { orgId }                 = req.user;
    try {
      const check = await db.query(
        `SELECT id FROM guides WHERE id = $1 AND site_id = $2 AND org_id = $3`,
        [id, siteId, orgId]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: 'guide not found' });

      const result = await db.query(
        `SELECT gv.*, u.name AS edited_by_name
         FROM guide_versions gv
         LEFT JOIN users u ON u.id = gv.edited_by
         WHERE gv.id = $1 AND gv.guide_id = $2 AND gv.org_id = $3`,
        [versionId, id, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'version not found' });
      const row = result.rows[0];
      res.json({ ...toVersion(row), content: row.content });
    } catch (err) {
      console.error('[GET /guides/:id/versions/:versionId]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post('/:id/restore/:versionId', async (req, res) => {
    const { siteId, id, versionId } = req.params;
    const { orgId, userId }         = req.user;
    try {
      const guideCheck = await db.query(
        `SELECT * FROM guides WHERE id = $1 AND site_id = $2 AND org_id = $3`,
        [id, siteId, orgId]
      );
      if (guideCheck.rows.length === 0) return res.status(404).json({ error: 'guide not found' });

      const versionCheck = await db.query(
        `SELECT * FROM guide_versions WHERE id = $1 AND guide_id = $2 AND org_id = $3`,
        [versionId, id, orgId]
      );
      if (versionCheck.rows.length === 0) return res.status(404).json({ error: 'version not found' });

      const ver = versionCheck.rows[0];

      await snapshotVersion(db, id, orgId, userId);

      const result = await db.query(
        `UPDATE guides SET title = $1, content = $2, updated_at = now()
         WHERE id = $3 AND site_id = $4 AND org_id = $5
         RETURNING *`,
        [ver.title, ver.content, id, siteId, orgId]
      );
      res.json(toGuide(result.rows[0]));
    } catch (err) {
      console.error('[POST /guides/:id/restore/:versionId]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    try {
      const result = await db.query(
        `DELETE FROM guides WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
        [id, siteId, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'guide not found' });
      res.status(204).end();
    } catch (err) {
      console.error('[DELETE /guides/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
