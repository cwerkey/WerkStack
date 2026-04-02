'use strict';

const path = require('path');
const fs   = require('fs');

function withToken(remoteUrl, token) {
  if (!token) return remoteUrl;
  try {
    const u = new URL(remoteUrl);
    u.username = 'x-access-token';
    u.password = token;
    return u.toString();
  } catch {
    return remoteUrl;
  }
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

async function fetchGuides(db, orgId, siteId) {
  const client = await db.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
    const guidesRes  = await client.query(
      `SELECT g.*, gm.name AS manual_name
       FROM guides g
       LEFT JOIN guide_manuals gm ON gm.id = g.manual_id
       WHERE g.site_id = $1 AND g.org_id = $2
       ORDER BY g.sort_order ASC, g.updated_at DESC`,
      [siteId, orgId]
    );
    const manualsRes = await client.query(
      `SELECT * FROM guide_manuals WHERE site_id = $1 AND org_id = $2 ORDER BY sort_order ASC`,
      [siteId, orgId]
    );
    return { guides: guidesRes.rows, manuals: manualsRes.rows };
  } finally {
    client.release();
  }
}

/**
 * Returns true if any guide was updated after lastSyncAt (or lastSyncAt is null).
 */
async function hasChanges(db, orgId, siteId, lastSyncAt) {
  if (!lastSyncAt) return true;
  const client = await db.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [orgId]);
    const res = await client.query(
      `SELECT 1 FROM guides
       WHERE site_id = $1 AND org_id = $2 AND updated_at > $3
       LIMIT 1`,
      [siteId, orgId, lastSyncAt]
    );
    return res.rows.length > 0;
  } finally {
    client.release();
  }
}

async function pushGuides(config, guides, manuals) {
  const simpleGit = require('simple-git');

  const repoDir = path.join('/tmp', 'werkstack-git-sync', config.site_id);
  fs.mkdirSync(repoDir, { recursive: true });

  const authenticatedUrl = withToken(config.repo_url, config.auth_token);
  const git = simpleGit(repoDir);

  const isRepo = fs.existsSync(path.join(repoDir, '.git'));
  if (!isRepo) {
    await git.clone(authenticatedUrl, repoDir, ['--branch', config.branch, '--depth', '1']);
  } else {
    await git.remote(['set-url', 'origin', authenticatedUrl]);
    await git.pull('origin', config.branch, ['--rebase']);
  }

  await git.addConfig('user.email', 'werkstack-sync@noreply');
  await git.addConfig('user.name', 'WerkStack Sync');

  const guidesDir = path.join(repoDir, 'guides');
  if (fs.existsSync(guidesDir)) {
    fs.rmSync(guidesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(guidesDir, { recursive: true });

  const manualMap = Object.fromEntries(manuals.map(m => [m.id, m.name]));

  for (const guide of guides) {
    const folderName = guide.manual_id
      ? slugify(manualMap[guide.manual_id] || 'uncategorized')
      : 'uncategorized';

    const dir = path.join(guidesDir, folderName);
    fs.mkdirSync(dir, { recursive: true });

    const filename = `${slugify(guide.title)}.md`;
    const header = [
      `# ${guide.title}`,
      ``,
      `> Manual: ${guide.manual_name || 'Uncategorized'}  `,
      `> Last updated: ${new Date(guide.updated_at).toISOString()}`,
      ``,
    ].join('\n');

    fs.writeFileSync(path.join(dir, filename), header + (guide.content || ''), 'utf8');
  }

  // Write index
  const indexLines = [`# WerkStack Guides`, ``, `Exported: ${new Date().toISOString()}`, ``];
  for (const manual of manuals) {
    const folderName = slugify(manual.name);
    const manualGuides = guides.filter(g => g.manual_id === manual.id);
    if (manualGuides.length === 0) continue;
    indexLines.push(`## ${manual.name}`, ``);
    for (const g of manualGuides) {
      indexLines.push(`- [${g.title}](guides/${folderName}/${slugify(g.title)}.md)`);
    }
    indexLines.push('');
  }

  const uncategorized = guides.filter(g => !g.manual_id);
  if (uncategorized.length > 0) {
    indexLines.push(`## Uncategorized`, ``);
    for (const g of uncategorized) {
      indexLines.push(`- [${g.title}](guides/uncategorized/${slugify(g.title)}.md)`);
    }
  }

  fs.writeFileSync(path.join(repoDir, 'README.md'), indexLines.join('\n'), 'utf8');

  await git.add('.');
  const status = await git.status();
  if (status.files.length === 0) {
    return { pushed: false };
  }

  await git.commit(`WerkStack sync: ${new Date().toISOString()}`);
  await git.push('origin', config.branch);
  return { pushed: true };
}

function unslugify(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Clone or pull the remote repo, return the repo directory path.
 */
async function pullRepo(config) {
  const simpleGit = require('simple-git');

  const repoDir = path.join('/tmp', 'werkstack-git-sync', config.site_id);
  fs.mkdirSync(repoDir, { recursive: true });

  const authenticatedUrl = withToken(config.repo_url, config.auth_token);
  const git = simpleGit(repoDir);

  const isRepo = fs.existsSync(path.join(repoDir, '.git'));
  if (!isRepo) {
    await git.clone(authenticatedUrl, repoDir, ['--branch', config.branch, '--depth', '1']);
  } else {
    await git.remote(['set-url', 'origin', authenticatedUrl]);
    await git.pull('origin', config.branch, ['--rebase']);
  }

  return repoDir;
}

/**
 * Read all .md files under guides/ in the repo and parse them.
 * Strips the metadata header that pushGuides adds (# title, > Manual:, > Last updated:).
 * Returns array of { path, title, manualName, content }.
 */
function parseImportFiles(repoDir) {
  const guidesDir = path.join(repoDir, 'guides');
  if (!fs.existsSync(guidesDir)) return [];

  const results = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relativePath = path.relative(guidesDir, full);
        const raw = fs.readFileSync(full, 'utf8');

        // Derive manual name from parent folder
        const parts = relativePath.split(path.sep);
        const folderName = parts.length > 1 ? parts[0] : 'uncategorized';
        const manualName = folderName === 'uncategorized' ? 'Uncategorized' : unslugify(folderName);

        // Strip metadata header that pushGuides adds
        const lines = raw.split('\n');
        let i = 0;
        let title = entry.name.replace(/\.md$/, '');

        // First line: # Title
        if (i < lines.length && lines[i].startsWith('# ')) {
          title = lines[i].slice(2).trim();
          i++;
        }

        // Skip empty line after title
        if (i < lines.length && lines[i].trim() === '') i++;

        // Skip > Manual: line
        if (i < lines.length && lines[i].startsWith('> Manual:')) i++;

        // Skip > Last updated: line
        if (i < lines.length && lines[i].startsWith('> Last updated:')) i++;

        // Skip trailing empty line after metadata
        if (i < lines.length && lines[i].trim() === '') i++;

        const content = lines.slice(i).join('\n');

        results.push({
          path: relativePath,
          title,
          manualName,
          content,
        });
      }
    }
  }

  walk(guidesDir);
  return results;
}

module.exports = { fetchGuides, hasChanges, pushGuides, withToken, pullRepo, parseImportFiles, slugify };
