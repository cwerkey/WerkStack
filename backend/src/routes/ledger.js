'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');


const LedgerItemSchema = z.object({
  name:     z.string().min(1).max(200),
  category: z.enum(['ram', 'cpu', 'drive', 'cable', 'psu', 'fan', 'pcie-card', 'misc']).default('misc'),
  sku:      z.string().max(100).optional(),
  quantity: z.number().int().min(0).default(0),
  unitCost: z.number().min(0).optional(),
  notes:    z.string().max(2000).optional(),
});

const LedgerTransactionSchema = z.object({
  ledgerItemId: z.string().uuid(),
  deviceId:     z.string().uuid().optional(),
  action:       z.enum(['add', 'remove', 'reserve', 'unreserve', 'install', 'uninstall']),
  quantity:     z.number().int().min(1),
  note:         z.string().max(2000).optional(),
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

function toItem(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    name:      row.name,
    category:  row.category,
    sku:       row.sku      ?? undefined,
    quantity:  row.quantity,
    reserved:  row.reserved,
    unitCost:  row.unit_cost != null ? parseFloat(row.unit_cost) : undefined,
    notes:     row.notes    ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTx(row) {
  return {
    id:           row.id,
    orgId:        row.org_id,
    siteId:       row.site_id,
    ledgerItemId: row.ledger_item_id,
    deviceId:     row.device_id ?? undefined,
    action:       row.action,
    quantity:     row.quantity,
    note:         row.note ?? undefined,
    createdBy:    row.created_by ?? undefined,
    createdAt:    row.created_at,
  };
}


module.exports = function ledgerRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));


  router.get('/', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM ledger_items WHERE site_id = $1 AND org_id = $2 ORDER BY name`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toItem));
    } catch (err) {
      console.error('[GET /ledger]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/',
    requireRole('member'), validate(LedgerItemSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      const { name, category, sku, quantity, unitCost, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO ledger_items (org_id, site_id, name, category, sku, quantity, unit_cost, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [orgId, siteId, name, category, sku ?? null, quantity,
             unitCost ?? null, notes ?? null]
          )
        );
        res.status(201).json(toItem(result.rows[0]));
      } catch (err) {
        console.error('[POST /ledger]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:itemId',
    requireRole('member'), validate(LedgerItemSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, itemId } = req.params;
      const { name, category, sku, quantity, unitCost, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE ledger_items
             SET name=$1, category=$2, sku=$3, quantity=$4, unit_cost=$5, notes=$6, updated_at=now()
             WHERE id=$7 AND site_id=$8 AND org_id=$9 RETURNING *`,
            [name, category, sku ?? null, quantity, unitCost ?? null, notes ?? null,
             itemId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'item not found' });
        res.json(toItem(result.rows[0]));
      } catch (err) {
        console.error('[PATCH /ledger/:itemId]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:itemId',
    requireRole('member'),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, itemId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM ledger_items WHERE id=$1 AND site_id=$2 AND org_id=$3 RETURNING id`,
            [itemId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'item not found' });
        res.status(204).end();
      } catch (err) {
        console.error('[DELETE /ledger/:itemId]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );


  router.get('/transactions', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    const { itemId } = req.query;
    try {
      let query = `SELECT * FROM ledger_transactions WHERE site_id = $1 AND org_id = $2`;
      const params = [siteId, orgId];
      if (itemId) {
        query += ` AND ledger_item_id = $3`;
        params.push(itemId);
      }
      query += ` ORDER BY created_at DESC LIMIT 200`;

      const result = await withOrg(db, orgId, c => c.query(query, params));
      res.json(result.rows.map(toTx));
    } catch (err) {
      console.error('[GET /ledger/transactions]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/transactions',
    requireRole('member'), validate(LedgerTransactionSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      const { ledgerItemId, deviceId, action, quantity, note } = req.body;

      try {
        const result = await withOrg(db, orgId, async (c) => {
          await c.query('BEGIN');

          try {
            const itemRes = await c.query(
              `SELECT * FROM ledger_items WHERE id=$1 AND site_id=$2 AND org_id=$3 FOR UPDATE`,
              [ledgerItemId, siteId, orgId]
            );
            if (itemRes.rows.length === 0) {
              await c.query('ROLLBACK');
              return { error: 'ledger item not found', status: 404 };
            }

            const item = itemRes.rows[0];
            let newQty = item.quantity;
            let newReserved = item.reserved;

            switch (action) {
              case 'add':
                newQty += quantity;
                break;
              case 'remove':
                if (item.quantity - item.reserved < quantity) {
                  await c.query('ROLLBACK');
                  return { error: `insufficient available quantity (have ${item.quantity - item.reserved}, need ${quantity})`, status: 400 };
                }
                newQty -= quantity;
                break;
              case 'reserve':
                if (item.quantity - item.reserved < quantity) {
                  await c.query('ROLLBACK');
                  return { error: `insufficient available quantity to reserve (have ${item.quantity - item.reserved}, need ${quantity})`, status: 400 };
                }
                newReserved += quantity;
                break;
              case 'unreserve':
                if (item.reserved < quantity) {
                  await c.query('ROLLBACK');
                  return { error: `cannot unreserve ${quantity} — only ${item.reserved} reserved`, status: 400 };
                }
                newReserved -= quantity;
                break;
              case 'install':
                if (item.quantity < quantity) {
                  await c.query('ROLLBACK');
                  return { error: `insufficient quantity to install (have ${item.quantity}, need ${quantity})`, status: 400 };
                }
                newQty -= quantity;
                newReserved = Math.max(0, newReserved - quantity);
                break;
              case 'uninstall':
                newQty += quantity;
                break;
            }

            await c.query(
              `UPDATE ledger_items SET quantity=$1, reserved=$2, updated_at=now()
               WHERE id=$3`,
              [newQty, newReserved, ledgerItemId]
            );

            const txRes = await c.query(
              `INSERT INTO ledger_transactions
                 (org_id, site_id, ledger_item_id, device_id, action, quantity, note, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
              [orgId, siteId, ledgerItemId, deviceId ?? null, action, quantity,
               note ?? null, req.user.id]
            );

            await c.query('COMMIT');
            return { transaction: toTx(txRes.rows[0]) };
          } catch (txErr) {
            await c.query('ROLLBACK');
            throw txErr;
          }
        });

        if (result.error) {
          return res.status(result.status).json({ error: result.error });
        }
        res.status(201).json(result.transaction);
      } catch (err) {
        console.error('[POST /ledger/transactions]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
