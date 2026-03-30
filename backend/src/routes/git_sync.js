'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const GitSyncConfigSchema = z.object({
  repoUrl:      z.string().min(1).max(500),
  branch:       z.string().min(1).max(100).default('main'),
  enabled:      z.boolean().default(false),
  pushInterval: z.number().int().min(60).max(86400).default(300),
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

function toConfig(row) {
  return {
    id:            row.id,
    orgId:         row.org_id,
    siteId:        row.site_id,
    repoUrl:       row.repo_url,
    branch:        row.branch,
    enabled:       row.enabled,
    pushInterval:  row.push_interval,
    lastPushAt:    row.last_push_at  ?? undefined,
    lastPushError: row.last_push_error ?? undefined,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

async function exportSiteData(db, orgId, siteId) {
  const client = await db.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);

    const [
      sitesRes, racksRes, devicesRes, connsRes,
      subnetsRes, ipsRes, poolsRes, drivesRes, sharesRes,
    ] = await Promise.all([
      client.query(`SELECT * FROM sites WHERE id=$1 AND org_id=$2`, [siteId, orgId]),
      client.query(`SELECT * FROM racks WHERE site_id=$1 AND org_id=$2 ORDER BY name`, [siteId, orgId]),
      client.query(`SELECT * FROM device_instances WHERE site_id=$1 AND org_id=$2 ORDER BY name`, [siteId, orgId]),
      client.query(`SELECT * FROM connections WHERE site_id=$1 AND org_id=$2`, [siteId, orgId]),
      client.query(`SELECT * FROM subnets WHERE site_id=$1 AND org_id=$2`, [siteId, orgId]),
      client.query(`SELECT * FROM ip_assignments WHERE site_id=$1 AND org_id=$2`, [siteId, orgId]),
      client.query(`SELECT * FROM storage_pools WHERE site_id=$1 AND org_id=$2`, [siteId, orgId]),
      client.query(`SELECT * FROM drives WHERE site_id=$1 AND org_id=$2`, [siteId, orgId]),
      client.query(`SELECT * FROM shares WHERE site_id=$1 AND org_id=$2`, [siteId, orgId]),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      site:       sitesRes.rows[0] || null,
      racks:      racksRes.rows,
      devices:    devicesRes.rows,
      connections: connsRes.rows,
      subnets:    subnetsRes.rows,
      ips:        ipsRes.rows,
      pools:      poolsRes.rows,
      drives:     drivesRes.rows,
      shares:     sharesRes.rows,
    };
  } finally {
    client.release();
  }
}

module.exports = function gitSyncRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  router.get('/', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT * FROM git_sync_config WHERE site_id=$1 AND org_id=$2`,
          [siteId, orgId]
        )
      );
      if (result.rows.length === 0) return res.json(null);
      res.json(toConfig(result.rows[0]));
    } catch (err) {
      console.error('[GET /git-sync]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  router.put(
    '/',
    requireRole('admin'), validate(GitSyncConfigSchema),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;
      const { repoUrl, branch, enabled, pushInterval } = req.body;
      try {
        const result = await withOrg(db, orgId, c =>
          c.query(
            `INSERT INTO git_sync_config (org_id, site_id, repo_url, branch, enabled, push_interval)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (org_id, site_id)
             DO UPDATE SET repo_url=$3, branch=$4, enabled=$5, push_interval=$6, updated_at=now()
             RETURNING *`,
            [orgId, siteId, repoUrl, branch, enabled, pushInterval]
          )
        );
        res.json(toConfig(result.rows[0]));
      } catch (err) {
        console.error('[PUT /git-sync]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.post(
    '/push',
    requireRole('admin'),
    async (req, res) => {
      const { orgId }  = req.user;
      const { siteId } = req.params;

      try {
        const configRes = await withOrg(db, orgId, c =>
          c.query(
            `SELECT * FROM git_sync_config WHERE site_id=$1 AND org_id=$2`,
            [siteId, orgId]
          )
        );
        if (configRes.rows.length === 0) {
          return res.status(404).json({ error: 'git-sync not configured' });
        }

        const config = configRes.rows[0];

        const data = await exportSiteData(db, orgId, siteId);

        let pushError = null;
        try {
          const simpleGit = require('simple-git');
          const path = require('path');
          const fs   = require('fs');

          const repoDir = path.join('/tmp', 'werkstack-sync', siteId);
          fs.mkdirSync(repoDir, { recursive: true });

          const git = simpleGit(repoDir);

          const isRepo = fs.existsSync(path.join(repoDir, '.git'));
          if (!isRepo) {
            await git.clone(config.repo_url, repoDir, ['--branch', config.branch]);
          } else {
            await git.pull('origin', config.branch);
          }

          const filePath = path.join(repoDir, 'site-data.json');
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

          await git.add('.');
          const status = await git.status();
          if (status.files.length > 0) {
            await git.commit(`WerkStack auto-sync: ${new Date().toISOString()}`);
            await git.push('origin', config.branch);
          }
        } catch (gitErr) {
          pushError = gitErr.message;
        }

        await withOrg(db, orgId, c =>
          c.query(
            `UPDATE git_sync_config
             SET last_push_at = now(), last_push_error = $1, updated_at = now()
             WHERE site_id = $2 AND org_id = $3`,
            [pushError, siteId, orgId]
          )
        );

        if (pushError) {
          return res.status(500).json({ error: `git push failed: ${pushError}` });
        }

        res.json({ status: 'push completed', pushedAt: new Date().toISOString() });
      } catch (err) {
        console.error('[POST /git-sync/push]', err);
        res.status(500).json({ error: 'server error' });
      }
    }
  );

  router.get('/export', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    try {
      const data = await exportSiteData(db, orgId, siteId);
      res.json(data);
    } catch (err) {
      console.error('[GET /git-sync/export]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
