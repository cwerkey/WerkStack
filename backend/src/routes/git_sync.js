'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { fetchGuides, hasChanges, pushGuides, withToken } = require('../lib/git_sync_push');

const ConfigSchema = z.object({
  remoteUrl:  z.string().min(1).max(500),
  branch:     z.string().min(1).max(100).default('main'),
  authToken:  z.string().max(500).optional(),
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
    remoteUrl:      row.repo_url,
    branch:         row.branch,
    authToken:      row.auth_token ? '••••••••••••' : null,
    enabled:        row.enabled ?? true,
    lastSyncAt:     row.last_sync_at   ?? row.last_push_at   ?? undefined,
    lastSyncStatus: row.last_sync_status
                      ?? (row.last_push_error ? 'error' : row.last_push_at ? 'success' : undefined),
  };
}

module.exports = function gitSyncRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth);
  router.use(requireSiteAccess(db));

  // GET /config
  router.get('/config', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(`SELECT * FROM git_sync_config WHERE site_id=$1 AND org_id=$2`, [siteId, orgId])
      );
      if (result.rows.length === 0) return res.json(null);
      res.json(toConfig(result.rows[0]));
    } catch (err) {
      console.error('[GET /git-sync/config]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PUT /config
  router.put('/config', requireRole('admin'), validate(ConfigSchema), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    const { remoteUrl, branch, authToken } = req.body;
    try {
      const existing = await withOrg(db, orgId, c =>
        c.query(`SELECT auth_token FROM git_sync_config WHERE site_id=$1 AND org_id=$2`, [siteId, orgId])
      );
      const tokenToStore = authToken || (existing.rows[0]?.auth_token ?? null);

      const result = await withOrg(db, orgId, c =>
        c.query(
          `INSERT INTO git_sync_config (org_id, site_id, repo_url, branch, auth_token, enabled, push_interval)
           VALUES ($1,$2,$3,$4,$5,true,300)
           ON CONFLICT (org_id, site_id)
           DO UPDATE SET repo_url=$3, branch=$4, auth_token=$5, updated_at=now()
           RETURNING *`,
          [orgId, siteId, remoteUrl, branch, tokenToStore]
        )
      );
      res.json(toConfig(result.rows[0]));
    } catch (err) {
      console.error('[PUT /git-sync/config]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /enabled — toggle auto-sync on/off
  router.patch('/enabled', requireRole('admin'), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `UPDATE git_sync_config SET enabled=$1, updated_at=now()
           WHERE site_id=$2 AND org_id=$3 RETURNING *`,
          [enabled, siteId, orgId]
        )
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'not configured' });
      res.json(toConfig(result.rows[0]));
    } catch (err) {
      console.error('[PATCH /git-sync/enabled]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /status
  router.get('/status', async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    try {
      const result = await withOrg(db, orgId, c =>
        c.query(
          `SELECT last_sync_at, last_sync_status, last_push_at, last_push_error
           FROM git_sync_config WHERE site_id=$1 AND org_id=$2`,
          [siteId, orgId]
        )
      );
      if (result.rows.length === 0) return res.json({ lastSyncAt: null, lastSyncStatus: null });
      const row = result.rows[0];
      res.json({
        lastSyncAt:     row.last_sync_at   ?? row.last_push_at   ?? null,
        lastSyncStatus: row.last_sync_status
                          ?? (row.last_push_error ? 'error' : row.last_push_at ? 'success' : null),
      });
    } catch (err) {
      console.error('[GET /git-sync/status]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /test
  router.post('/test', requireRole('admin'), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;
    const { remoteUrl, branch, authToken } = req.body;

    let url   = remoteUrl;
    let token = authToken;
    let br    = branch || 'main';

    if (!url) {
      const stored = await withOrg(db, orgId, c =>
        c.query(`SELECT repo_url, branch, auth_token FROM git_sync_config WHERE site_id=$1 AND org_id=$2`, [siteId, orgId])
      );
      if (stored.rows.length === 0) return res.status(400).json({ error: 'no config saved yet' });
      url   = stored.rows[0].repo_url;
      token = token || stored.rows[0].auth_token;
      br    = stored.rows[0].branch;
    }

    try {
      const simpleGit      = require('simple-git');
      const authenticated  = withToken(url, token);
      await simpleGit().listRemote(['--heads', authenticated]);
      res.json({ ok: true, message: `Connected to ${url} (branch: ${br})` });
    } catch (err) {
      const safe = (err.message || 'connection failed').replace(/x-access-token:[^@]+@/, 'x-access-token:***@');
      res.json({ ok: false, message: safe });
    }
  });

  // POST /sync — manual trigger
  router.post('/sync', requireRole('admin'), async (req, res) => {
    const { orgId }  = req.user;
    const { siteId } = req.params;

    try {
      const configRes = await withOrg(db, orgId, c =>
        c.query(`SELECT * FROM git_sync_config WHERE site_id=$1 AND org_id=$2`, [siteId, orgId])
      );
      if (configRes.rows.length === 0) {
        return res.status(404).json({ error: 'git-sync not configured' });
      }

      const config = configRes.rows[0];
      if (!config.repo_url) return res.status(400).json({ error: 'no remote URL configured' });

      const { guides, manuals } = await fetchGuides(db, orgId, siteId);

      let syncError = null;
      let pushed    = false;
      try {
        ({ pushed } = await pushGuides(config, guides, manuals));
      } catch (gitErr) {
        syncError = gitErr.message.replace(/x-access-token:[^@]+@/, 'x-access-token:***@');
      }

      const status = syncError ? 'error' : 'success';
      await withOrg(db, orgId, c =>
        c.query(
          `UPDATE git_sync_config
           SET last_sync_at=$1, last_sync_status=$2, updated_at=now()
           WHERE site_id=$3 AND org_id=$4`,
          [new Date().toISOString(), status, siteId, orgId]
        )
      );

      if (syncError) {
        return res.status(500).json({ ok: false, message: `sync failed: ${syncError}` });
      }

      const msg = pushed
        ? `Synced ${guides.length} guide(s) to ${config.repo_url}`
        : `No changes since last sync — nothing pushed`;
      res.json({ ok: true, message: msg });
    } catch (err) {
      console.error('[POST /git-sync/sync]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
