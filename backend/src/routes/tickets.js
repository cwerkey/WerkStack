'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const TicketSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  status:      z.enum(['open', 'in-progress', 'closed']).default('open'),
  priority:    z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  categoryId:  z.string().min(1).optional().nullable(),
});

function toTicket(row) {
  return {
    id:          row.id,
    orgId:       row.org_id,
    siteId:      row.site_id,
    title:       row.title,
    description: row.description,
    status:      row.status,
    priority:    row.priority,
    categoryId:  row.category_id,
    createdBy:   row.created_by,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

module.exports = function ticketsRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  // GET /api/sites/:siteId/tickets
  router.get('/', async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    try {
      const result = await db.query(
        `SELECT * FROM tickets
         WHERE site_id = $1 AND org_id = $2
         ORDER BY created_at DESC`,
        [siteId, orgId]
      );
      res.json(result.rows.map(toTicket));
    } catch (err) {
      console.error('[GET /tickets]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /api/sites/:siteId/tickets
  router.post('/', validate(TicketSchema), async (req, res) => {
    const { siteId }                           = req.params;
    const { orgId, userId }                    = req.user;
    const { title, description, status, priority, categoryId } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO tickets
           (org_id, site_id, title, description, status, priority, category_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [orgId, siteId, title, description ?? null, status ?? 'open',
         priority ?? 'normal', categoryId ?? null, userId]
      );
      res.status(201).json(toTicket(result.rows[0]));
    } catch (err) {
      console.error('[POST /tickets]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /api/sites/:siteId/tickets/:id — full update (form always sends all fields)
  router.patch('/:id', validate(TicketSchema), async (req, res) => {
    const { siteId, id }                       = req.params;
    const { orgId }                            = req.user;
    const { title, description, status, priority, categoryId } = req.body;
    try {
      const result = await db.query(
        `UPDATE tickets
         SET title       = $1,
             description = $2,
             status      = $3,
             priority    = $4,
             category_id = $5,
             updated_at  = now()
         WHERE id = $6 AND site_id = $7 AND org_id = $8
         RETURNING *`,
        [title, description ?? null, status, priority, categoryId ?? null, id, siteId, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'ticket not found' });
      res.json(toTicket(result.rows[0]));
    } catch (err) {
      console.error('[PATCH /tickets/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // DELETE /api/sites/:siteId/tickets/:id — admin+ only
  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    try {
      const result = await db.query(
        `DELETE FROM tickets WHERE id = $1 AND site_id = $2 AND org_id = $3 RETURNING id`,
        [id, siteId, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'ticket not found' });
      res.status(204).end();
    } catch (err) {
      console.error('[DELETE /tickets/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
