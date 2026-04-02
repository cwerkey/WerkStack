'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { fetchGuides, hasChanges, pushGuides, withToken, pullRepo, parseImportFiles, slugify } = require('../lib/git_sync_push');

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

  // POST /import — preview what would be imported from git
  router.post('/import', requireRole('admin'), async (req, res) => {
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

      let repoDir;
      try {
        repoDir = await pullRepo(config);
      } catch (gitErr) {
        const safe = (gitErr.message || 'clone failed').replace(/x-access-token:[^@]+@/, 'x-access-token:***@');
        return res.status(500).json({ error: `git pull failed: ${safe}` });
      }

      const parsed = parseImportFiles(repoDir);

      // Fetch existing guides and manuals to detect conflicts
      const { guides: existingGuides, manuals: existingManuals } = await fetchGuides(db, orgId, siteId);

      const manualsByName = Object.fromEntries(existingManuals.map(m => [m.name.toLowerCase(), m]));

      const files = parsed.map(f => {
        const manualKey = f.manualName.toLowerCase();
        const manual = manualsByName[manualKey];

        // Check if a guide with same title exists in the same manual
        const existing = existingGuides.find(g => {
          const gManualName = g.manual_name || 'Uncategorized';
          return g.title.toLowerCase() === f.title.toLowerCase()
            && gManualName.toLowerCase() === manualKey;
        });

        let status = 'new';
        if (existing) {
          // Compare content to see if unchanged
          const existingContent = existing.content || '';
          if (existingContent.trim() === f.content.trim()) {
            status = 'unchanged';
          } else {
            status = 'conflict';
          }
        }

        return {
          path: f.path,
          title: f.title,
          manualName: f.manualName,
          status,
          existingGuideId: existing?.id ?? undefined,
        };
      });

      res.json({ files });
    } catch (err) {
      console.error('[POST /git-sync/import]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /import/confirm — actually import selected files
  router.post('/import/confirm', requireRole('admin'), async (req, res) => {
    const { orgId, userId } = req.user;
    const { siteId }        = req.params;
    const { files }          = req.body;

    if (!Array.isArray(files)) {
      return res.status(400).json({ error: 'files must be an array' });
    }

    try {
      const configRes = await withOrg(db, orgId, c =>
        c.query(`SELECT * FROM git_sync_config WHERE site_id=$1 AND org_id=$2`, [siteId, orgId])
      );
      if (configRes.rows.length === 0) {
        return res.status(404).json({ error: 'git-sync not configured' });
      }

      const config = configRes.rows[0];
      const repoDir = require('path').join('/tmp', 'werkstack-git-sync', config.site_id);
      const parsed = parseImportFiles(repoDir);

      const parsedByPath = Object.fromEntries(parsed.map(f => [f.path, f]));

      // Fetch existing guides and manuals
      const { guides: existingGuides, manuals: existingManuals } = await fetchGuides(db, orgId, siteId);
      const manualsByName = Object.fromEntries(existingManuals.map(m => [m.name.toLowerCase(), m]));

      let imported = 0;
      let skipped  = 0;
      const errors = [];

      for (const file of files) {
        if (!file.path || !file.action) {
          errors.push(`Invalid file entry: missing path or action`);
          continue;
        }

        if (file.action === 'skip') {
          skipped++;
          continue;
        }

        const p = parsedByPath[file.path];
        if (!p) {
          errors.push(`File not found in repo: ${file.path}`);
          continue;
        }

        try {
          // Resolve or create manual
          const manualKey = p.manualName.toLowerCase();
          let manual = manualsByName[manualKey];
          if (!manual && manualKey !== 'uncategorized') {
            const manualRes = await withOrg(db, orgId, c =>
              c.query(
                `INSERT INTO guide_manuals (org_id, site_id, name, sort_order)
                 VALUES ($1, $2, $3, 0)
                 RETURNING *`,
                [orgId, siteId, p.manualName]
              )
            );
            manual = manualRes.rows[0];
            manualsByName[manualKey] = manual;
          }

          const manualId = manual?.id ?? null;

          if (file.action === 'overwrite') {
            // Find existing guide to overwrite
            const existing = existingGuides.find(g => {
              const gManualName = g.manual_name || 'Uncategorized';
              return g.title.toLowerCase() === p.title.toLowerCase()
                && gManualName.toLowerCase() === manualKey;
            });

            if (existing) {
              await withOrg(db, orgId, c =>
                c.query(
                  `UPDATE guides SET content=$1, updated_at=now()
                   WHERE id=$2 AND site_id=$3 AND org_id=$4`,
                  [p.content, existing.id, siteId, orgId]
                )
              );
              imported++;
            } else {
              errors.push(`Could not find existing guide to overwrite: ${p.title}`);
            }
          } else if (file.action === 'create_new') {
            await withOrg(db, orgId, c =>
              c.query(
                `INSERT INTO guides (org_id, site_id, title, content, manual_id, sort_order, created_by)
                 VALUES ($1, $2, $3, $4, $5, 0, $6)
                 RETURNING *`,
                [orgId, siteId, p.title, p.content, manualId, userId]
              )
            );
            imported++;
          } else {
            errors.push(`Unknown action "${file.action}" for ${file.path}`);
          }
        } catch (dbErr) {
          errors.push(`Failed to import ${p.title}: ${dbErr.message}`);
        }
      }

      res.json({ imported, skipped, errors });
    } catch (err) {
      console.error('[POST /git-sync/import/confirm]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};
