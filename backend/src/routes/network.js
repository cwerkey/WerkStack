'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const ConnectionSchema = z.object({
  srcDeviceId:   z.string().uuid(),
  srcPort:       z.string().max(200).optional(),
  srcBlockId:    z.string().max(200).optional(),
  srcBlockType:  z.string().max(50).optional(),
  dstDeviceId:   z.string().uuid().optional().nullable(),
  dstPort:       z.string().max(200).optional(),
  dstBlockId:    z.string().max(200).optional(),
  dstBlockType:  z.string().max(50).optional(),
  externalLabel: z.string().min(1).max(200).optional().nullable(),
  cableTypeId:   z.string().max(100).optional(),
  label:         z.string().max(200).optional(),
  notes:         z.string().max(2000).optional(),
}).superRefine((data, ctx) => {
  const hasDst = !!data.dstDeviceId;
  const hasExt = !!data.externalLabel;
  if (!hasDst && !hasExt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'either dstDeviceId or externalLabel is required', path: ['dstDeviceId'] });
  }
  if (hasDst && hasExt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dstDeviceId and externalLabel are mutually exclusive', path: ['externalLabel'] });
  }
});

const SubnetSchema = z.object({
  cidr:    z.string().min(1).max(50).regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/, 'must be valid CIDR (e.g. 192.168.1.0/24)'),
  name:    z.string().min(1).max(200),
  vlan:    z.number().int().min(1).max(4094).optional().nullable(),
  gateway: z.string().max(50).optional(),
  notes:   z.string().max(2000).optional(),
});

const IpAssignmentSchema = z.object({
  ip:       z.string().min(1).max(50).regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'must be valid IPv4 address'),
  deviceId: z.string().uuid().optional().nullable(),
  label:    z.string().max(200).optional(),
  notes:    z.string().max(2000).optional(),
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

function toConnection(row) {
  return {
    id:            row.id,
    orgId:         row.org_id,
    siteId:        row.site_id,
    srcDeviceId:   row.src_device_id,
    srcPort:       row.src_port       ?? undefined,
    srcBlockId:    row.src_block_id   ?? undefined,
    srcBlockType:  row.src_block_type ?? undefined,
    dstDeviceId:   row.dst_device_id  ?? null,
    dstPort:       row.dst_port       ?? undefined,
    dstBlockId:    row.dst_block_id   ?? undefined,
    dstBlockType:  row.dst_block_type ?? undefined,
    externalLabel: row.external_label ?? null,
    cableTypeId:   row.cable_type_id  ?? undefined,
    label:         row.label          ?? undefined,
    notes:         row.notes          ?? undefined,
    createdAt:     row.created_at,
  };
}

function toSubnet(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    cidr:      row.cidr,
    name:      row.name,
    vlan:      row.vlan    ?? undefined,
    gateway:   row.gateway ?? undefined,
    notes:     row.notes   ?? undefined,
    createdAt: row.created_at,
  };
}

function toIp(row) {
  return {
    id:        row.id,
    orgId:     row.org_id,
    siteId:    row.site_id,
    subnetId:  row.subnet_id,
    ip:        row.ip,
    deviceId:  row.device_id ?? undefined,
    label:     row.label     ?? undefined,
    notes:     row.notes     ?? undefined,
    createdAt: row.created_at,
  };
}

function ipToNum(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function numToIp(n) {
  return `${(n >>> 24) & 0xFF}.${(n >>> 16) & 0xFF}.${(n >>> 8) & 0xFF}.${n & 0xFF}`;
}

function parseCidr(cidr) {
  const [network, bitsStr] = cidr.split('/');
  const bits        = parseInt(bitsStr, 10);
  const networkNum  = ipToNum(network);
  const mask        = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const first       = (networkNum & mask) >>> 0;
  const last        = (first | (~mask >>> 0)) >>> 0;
  // For /31 and /32 (point-to-point / host) use full range; otherwise skip .0 and .255-equiv
  if (bits >= 31) return { start: first, end: last };
  return { start: first + 1, end: last - 1 };
}

function ipInCidr(ip, cidr) {
  const { start, end } = parseCidr(cidr);
  const n = ipToNum(ip);
  return n >= start && n <= end;
}

module.exports = function networkRoutes(db) {
  const router = express.Router({ mergeParams: true });

  router.get('/:siteId/devices/:deviceId/connections', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId, deviceId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM connections
           WHERE site_id = $1 AND org_id = $2
             AND (src_device_id = $3 OR dst_device_id = $3)
           ORDER BY created_at`,
          [siteId, orgId, deviceId]
        )
      );
      res.json(result.rows.map(toConnection));
    } catch (err) {
      console.error(`[GET /devices/${deviceId}/connections]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.delete('/:siteId/devices/:deviceId/connections', requireAuth, requireSiteAccess(db), requireRole('member'), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId, deviceId } = req.params;
    try {
      await withOrg(db, orgId, c =>
        c.query(
          `DELETE FROM connections
           WHERE site_id = $1 AND org_id = $2
             AND (src_device_id = $3 OR dst_device_id = $3)`,
          [siteId, orgId, deviceId]
        )
      );
      res.status(204).end();
    } catch (err) {
      console.error(`[DELETE /devices/${deviceId}/connections]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.get('/:siteId/connections', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM connections WHERE site_id = $1 AND org_id = $2 ORDER BY created_at`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toConnection));
    } catch (err) {
      console.error(`[GET /connections]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/:siteId/connections',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(ConnectionSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      const {
        srcDeviceId, srcPort, srcBlockId, srcBlockType,
        dstDeviceId, dstPort, dstBlockId, dstBlockType,
        externalLabel, cableTypeId, label, notes,
      } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO connections
               (org_id, site_id, src_device_id, src_port, src_block_id, src_block_type,
                dst_device_id, dst_port, dst_block_id, dst_block_type,
                external_label, cable_type_id, label, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING *`,
            [orgId, siteId,
             srcDeviceId, srcPort ?? null, srcBlockId ?? null, srcBlockType ?? null,
             dstDeviceId ?? null, dstPort ?? null, dstBlockId ?? null, dstBlockType ?? null,
             externalLabel ?? null, cableTypeId ?? null, label ?? null, notes ?? null]
          )
        );
        res.status(201).json(toConnection(result.rows[0]));
      } catch (err) {
        console.error(`[POST /connections]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/connections/:connId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(ConnectionSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, connId } = req.params;
      const {
        srcDeviceId, srcPort, srcBlockId, srcBlockType,
        dstDeviceId, dstPort, dstBlockId, dstBlockType,
        externalLabel, cableTypeId, label, notes,
      } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE connections
             SET src_device_id=$1, src_port=$2, src_block_id=$3, src_block_type=$4,
                 dst_device_id=$5, dst_port=$6, dst_block_id=$7, dst_block_type=$8,
                 external_label=$9, cable_type_id=$10, label=$11, notes=$12
             WHERE id=$13 AND site_id=$14 AND org_id=$15
             RETURNING *`,
            [srcDeviceId, srcPort ?? null, srcBlockId ?? null, srcBlockType ?? null,
             dstDeviceId ?? null, dstPort ?? null, dstBlockId ?? null, dstBlockType ?? null,
             externalLabel ?? null, cableTypeId ?? null, label ?? null, notes ?? null,
             connId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'connection not found' });
        res.json(toConnection(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /connections/${connId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/connections/:connId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, connId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM connections WHERE id=$1 AND site_id=$2 AND org_id=$3 RETURNING id`,
            [connId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'connection not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /connections/${connId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get('/:siteId/subnets', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM subnets WHERE site_id = $1 AND org_id = $2 ORDER BY created_at`,
          [siteId, orgId]
        )
      );
      res.json(result.rows.map(toSubnet));
    } catch (err) {
      console.error(`[GET /subnets]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/:siteId/subnets',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(SubnetSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      const { cidr, name, vlan, gateway, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO subnets (org_id, site_id, cidr, name, vlan, gateway, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING *`,
            [orgId, siteId, cidr, name, vlan ?? null, gateway ?? null, notes ?? null]
          )
        );
        res.status(201).json(toSubnet(result.rows[0]));
      } catch (err) {
        console.error(`[POST /subnets]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/subnets/:subnetId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(SubnetSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, subnetId } = req.params;
      const { cidr, name, vlan, gateway, notes } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE subnets
             SET cidr=$1, name=$2, vlan=$3, gateway=$4, notes=$5
             WHERE id=$6 AND site_id=$7 AND org_id=$8
             RETURNING *`,
            [cidr, name, vlan ?? null, gateway ?? null, notes ?? null,
             subnetId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'subnet not found' });
        res.json(toSubnet(result.rows[0]));
      } catch (err) {
        console.error(`[PATCH /subnets/${subnetId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/subnets/:subnetId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, subnetId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM subnets WHERE id=$1 AND site_id=$2 AND org_id=$3 RETURNING id`,
            [subnetId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'subnet not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /subnets/${subnetId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get('/:siteId/subnets/:subnetId/ips', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId, subnetId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM ip_assignments
           WHERE subnet_id = $1 AND site_id = $2 AND org_id = $3
           ORDER BY ip`,
          [subnetId, siteId, orgId]
        )
      );
      res.json(result.rows.map(toIp));
    } catch (err) {
      console.error(`[GET /subnets/${subnetId}/ips]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.get('/:siteId/subnets/:subnetId/ips/next', requireAuth, requireSiteAccess(db), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId, subnetId } = req.params;
    try {
      const [subnetResult, assignedResult] = await withOrg(db, orgId, async c => {
        const sr = await c.query(
          `SELECT cidr FROM subnets WHERE id=$1 AND site_id=$2 AND org_id=$3`,
          [subnetId, siteId, orgId]
        );
        if (sr.rows.length === 0) return [null, null];
        const ar = await c.query(
          `SELECT ip FROM ip_assignments WHERE subnet_id=$1 AND org_id=$2`,
          [subnetId, orgId]
        );
        return [sr.rows[0], ar.rows];
      });

      if (!subnetResult) return res.status(404).json({ error: 'subnet not found' });

      const { cidr }   = subnetResult;
      const assigned   = new Set(assignedResult.map(r => r.ip));
      const { start, end } = parseCidr(cidr);

      let nextIp = null;
      for (let n = start; n <= end; n++) {
        const candidate = numToIp(n);
        if (!assigned.has(candidate)) {
          nextIp = candidate;
          break;
        }
      }

      res.json({ ip: nextIp });
    } catch (err) {
      console.error(`[GET /subnets/${subnetId}/ips/next]`, err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.post(
    '/:siteId/subnets/:subnetId/ips',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(IpAssignmentSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, subnetId } = req.params;
      const { ip, deviceId, label, notes } = req.body;
      try {
        const subnetResult = await withOrg(db, orgId, c =>
          c.query(`SELECT cidr FROM subnets WHERE id=$1 AND site_id=$2 AND org_id=$3`,
            [subnetId, siteId, orgId])
        );
        if (subnetResult.rows.length === 0) return res.status(404).json({ error: 'subnet not found' });
        if (!ipInCidr(ip, subnetResult.rows[0].cidr)) {
          return res.status(400).json({ error: `IP ${ip} is not within subnet ${subnetResult.rows[0].cidr}` });
        }

        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO ip_assignments (org_id, site_id, subnet_id, ip, device_id, label, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING *`,
            [orgId, siteId, subnetId, ip, deviceId ?? null, label ?? null, notes ?? null]
          )
        );
        res.status(201).json(toIp(result.rows[0]));
      } catch (err) {
        if (err.code === '23505') {
          return res.status(409).json({ error: `IP ${ip} is already assigned in this subnet` });
        }
        console.error(`[POST /subnets/${subnetId}/ips]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.patch(
    '/:siteId/subnets/:subnetId/ips/:ipId',
    requireAuth, requireSiteAccess(db), requireRole('member'), validate(IpAssignmentSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, subnetId, ipId } = req.params;
      const { ip, deviceId, label, notes } = req.body;
      try {
        const subnetResult = await withOrg(db, orgId, c =>
          c.query(`SELECT cidr FROM subnets WHERE id=$1 AND site_id=$2 AND org_id=$3`,
            [subnetId, siteId, orgId])
        );
        if (subnetResult.rows.length === 0) return res.status(404).json({ error: 'subnet not found' });
        if (!ipInCidr(ip, subnetResult.rows[0].cidr)) {
          return res.status(400).json({ error: `IP ${ip} is not within subnet ${subnetResult.rows[0].cidr}` });
        }

        const result = await withOrg(db, orgId, c =>
          c.query(
            `UPDATE ip_assignments
             SET ip=$1, device_id=$2, label=$3, notes=$4
             WHERE id=$5 AND subnet_id=$6 AND site_id=$7 AND org_id=$8
             RETURNING *`,
            [ip, deviceId ?? null, label ?? null, notes ?? null,
             ipId, subnetId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'IP assignment not found' });
        res.json(toIp(result.rows[0]));
      } catch (err) {
        if (err.code === '23505') {
          return res.status(409).json({ error: `IP ${ip} is already assigned in this subnet` });
        }
        console.error(`[PATCH /subnets/${subnetId}/ips/${ipId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.delete(
    '/:siteId/subnets/:subnetId/ips/:ipId',
    requireAuth, requireSiteAccess(db), requireRole('member'),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId, subnetId, ipId } = req.params;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `DELETE FROM ip_assignments
             WHERE id=$1 AND subnet_id=$2 AND site_id=$3 AND org_id=$4
             RETURNING id`,
            [ipId, subnetId, siteId, orgId]
          )
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'IP assignment not found' });
        res.status(204).end();
      } catch (err) {
        console.error(`[DELETE /subnets/${subnetId}/ips/${ipId}]`, err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  return router;
};
