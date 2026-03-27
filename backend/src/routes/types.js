'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const { z }          = require('zod');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Inline schema — name (1-100 chars) + hex color (#RRGGBB)
const TypeSchema = z.object({
  name:  z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function toType(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    name:      row.name,
    color:     row.color,
    isBuiltin: row.is_builtin,
    createdAt: row.created_at,
  };
}

// Acquire a client, set org context, run callback, release.
async function withOrg(db, orgId, fn) {
  const client = await db.connect();
  try {
    await client.query('SET LOCAL app.current_org_id = $1', [orgId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

// Generic CRUD factory — builds POST / PATCH / DELETE handlers for one table.
function makeCrud(table, schema) {
  return {
    // POST /api/types/:category
    async create(req, res) {
      const { orgId } = req.user;
      const { name, color } = req.body;
      try {
        const id = randomUUID();
        const result = await withOrg(req.db, orgId, (c) =>
          c.query(
            `INSERT INTO ${table} (id, org_id, name, color, is_builtin)
             VALUES ($1, $2, $3, $4, FALSE)
             RETURNING *`,
            [id, orgId, name, color]
          )
        );
        res.status(201).json(toType(result.rows[0]));
      } catch (err) {
        console.error(`[POST /api/types/${table}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    },

    // PATCH /api/types/:category/:id
    async update(req, res) {
      const { orgId } = req.user;
      const { id } = req.params;
      const { name, color } = req.body;
      try {
        const result = await withOrg(req.db, orgId, (c) =>
          c.query(
            `UPDATE ${table}
             SET name = $1, color = $2
             WHERE id = $3 AND org_id = $4 AND is_builtin = FALSE
             RETURNING *`,
            [name, color, id, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'type not found or is built-in' });
        }
        res.json(toType(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /api/types/${table}/${id}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    },

    // DELETE /api/types/:category/:id
    async remove(req, res) {
      const { orgId } = req.user;
      const { id } = req.params;
      try {
        const result = await withOrg(req.db, orgId, (c) =>
          c.query(
            `DELETE FROM ${table}
             WHERE id = $1 AND org_id = $2 AND is_builtin = FALSE
             RETURNING id`,
            [id, orgId]
          )
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'type not found or is built-in' });
        }
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /api/types/${table}/${id}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    },

    schema,
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

module.exports = function typesRoutes(db) {
  const router = express.Router();

  // Attach db to every request for handler convenience
  router.use((req, _res, next) => { req.db = db; next(); });
  router.use(requireAuth);

  // ── GET /api/types — hydrates all type categories at once ─────────────────
  router.get('/', async (req, res) => {
    const { orgId } = req.user;
    try {
      const [dt, pt, ct, vt, at, tc] = await withOrg(db, orgId, (c) =>
        Promise.all([
          c.query('SELECT * FROM device_types      ORDER BY is_builtin DESC, name'),
          c.query('SELECT * FROM pcie_types         ORDER BY is_builtin DESC, name'),
          c.query('SELECT * FROM cable_types        ORDER BY is_builtin DESC, name'),
          c.query('SELECT * FROM vm_types           ORDER BY is_builtin DESC, name'),
          c.query('SELECT * FROM app_types          ORDER BY is_builtin DESC, name'),
          c.query('SELECT * FROM ticket_categories  ORDER BY is_builtin DESC, name'),
        ])
      );
      res.json({
        deviceTypes:      dt.rows.map(toType),
        pcieTypes:        pt.rows.map(toType),
        cableTypes:       ct.rows.map(toType),
        vmTypes:          vt.rows.map(toType),
        appTypes:         at.rows.map(toType),
        ticketCategories: tc.rows.map(toType),
      });
    } catch (err) {
      console.error('[GET /api/types]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ── Per-category CRUD (admin+ required for mutations) ─────────────────────

  const categories = [
    { path: 'devices',  ...makeCrud('device_types',     TypeSchema) },
    { path: 'pcie',     ...makeCrud('pcie_types',        TypeSchema) },
    { path: 'cables',   ...makeCrud('cable_types',       TypeSchema) },
    { path: 'vms',      ...makeCrud('vm_types',          TypeSchema) },
    { path: 'apps',     ...makeCrud('app_types',         TypeSchema) },
    { path: 'tickets',  ...makeCrud('ticket_categories', TypeSchema) },
  ];

  for (const cat of categories) {
    router.post(
      `/${cat.path}`,
      requireRole('admin'),
      validate(cat.schema),
      cat.create
    );
    router.patch(
      `/${cat.path}/:id`,
      requireRole('admin'),
      validate(cat.schema),
      cat.update
    );
    router.delete(
      `/${cat.path}/:id`,
      requireRole('admin'),
      cat.remove
    );
  }

  return router;
};
