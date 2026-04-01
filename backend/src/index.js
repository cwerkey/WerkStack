'use strict';

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const { getDb }    = require('./db');
const { migrate }  = require('./db/migrate');
const authRoutes      = require('./routes/auth');
const typesRoutes     = require('./routes/types');
const sitesRoutes     = require('./routes/sites');
const templatesRoutes = require('./routes/templates');
const racksRoutes     = require('./routes/racks');
const storageRoutes   = require('./routes/storage');
const osStackRoutes   = require('./routes/os_stack');
const networkRoutes   = require('./routes/network');
const overviewRoutes  = require('./routes/overview');
const ticketsRoutes   = require('./routes/tickets');
const guidesRoutes           = require('./routes/guides');
const guideManualsRoutes     = require('./routes/guide_manuals');
const { guideLinkQueryRoutes } = require('./routes/guide_links');
const searchRoutes           = require('./routes/search');
const usersRoutes        = require('./routes/users');
const pathfinderRoutes  = require('./routes/pathfinder');
const blueprintRoutes   = require('./routes/blueprints');
const ledgerRoutes      = require('./routes/ledger');
const monitorRoutes     = require('./routes/monitor');
const gitSyncRoutes     = require('./routes/git_sync');
const containersRoutes  = require('./routes/containers');
const conflictsRoutes   = require('./routes/conflicts');
const auditLogRoutes    = require('./routes/audit_log');
const modulesRoutes     = require('./routes/modules');
const taxonomiesRoutes  = require('./routes/taxonomies');
const topologyRoutes    = require('./routes/topology');
const vlansRoutes       = require('./routes/vlans');
const todosRoutes            = require('./routes/todos');
const guidesByEntityRoutes   = require('./routes/guides_entity');
const platformImportRoutes   = require('./routes/platform_import');
const rbacRoutes             = require('./routes/rbac');
const startWorkers      = require('./workers');

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://localhost:5175')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    // Allow any localhost origin in development
    if (origin && origin.match(/^https?:\/\/localhost:\d+$/)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function waitForDb(db, retries = 15, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await db.query('SELECT 1');
      console.log('[db] connected');
      return;
    } catch (err) {
      const remaining = retries - i - 1;
      if (remaining === 0) throw new Error(`[db] gave up after ${retries} attempts: ${err.message}`);
      console.log(`[db] waiting for postgres... (attempt ${i + 1}/${retries}, retry in ${delayMs / 1000}s)`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function start() {
  const db = getDb();

  await waitForDb(db);

  try {
    await migrate(db);
    console.log('[migrate] schema up to date');
  } catch (err) {
    console.error('[migrate] failed:', err.message);
    process.exit(1);
  }

  app.use('/api/auth',      authRoutes(db));
  app.use('/api/types',     typesRoutes(db));
  app.use('/api/sites',     sitesRoutes(db));
  app.use('/api/templates', templatesRoutes(db));
  app.use('/api/sites',     racksRoutes(db));
  app.use('/api/sites',     storageRoutes(db));
  app.use('/api/sites',     osStackRoutes(db));
  app.use('/api/sites',     networkRoutes(db));
  app.use('/api/sites',     containersRoutes(db));
  app.use('/api/sites/:siteId/overview', overviewRoutes(db));
  app.use('/api/sites/:siteId/tickets',  ticketsRoutes(db));
  app.use('/api/sites/:siteId/guides',        guidesRoutes(db));
  app.use('/api/sites/:siteId/guide-manuals', guideManualsRoutes(db));
  app.use('/api/sites/:siteId/guide-links',   guideLinkQueryRoutes(db));
  app.use('/api/sites/:siteId/search',        searchRoutes(db));
  app.use('/api/org/users',                   usersRoutes(db));
  app.use('/api/sites/:siteId/pathfinder',  pathfinderRoutes(db));
  app.use('/api/sites/:siteId/blueprints',  blueprintRoutes(db));
  app.use('/api/sites/:siteId/ledger',      ledgerRoutes(db));
  app.use('/api/sites/:siteId/monitor',     monitorRoutes(db));
  app.use('/api/sites/:siteId/git-sync',    gitSyncRoutes(db));
  app.use('/api/sites/:siteId/conflicts',   conflictsRoutes(db));
  app.use('/api/sites/:siteId/audit-log',   auditLogRoutes(db));
  app.use('/api/sites',                     modulesRoutes(db));
  app.use('/api/sites/:siteId/taxonomies',  taxonomiesRoutes(db));
  app.use('/api/sites',                     topologyRoutes(db));
  app.use('/api/sites',                     vlansRoutes(db));
  app.use('/api/sites',                     todosRoutes(db));
  app.use('/api/sites/:siteId/guides',      guidesByEntityRoutes(db));
  app.use('/api/sites',                     platformImportRoutes(db));
  app.use('/api/sites/:siteId/security-groups', rbacRoutes(db));

  startWorkers(db);

  app.use((req, res) => {
    res.status(404).json({ error: `route not found: ${req.method} ${req.path}` });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error('[unhandled error]', err);
    res.status(err.status || 500).json({ error: err.message || 'internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('[startup]', err);
  process.exit(1);
});
