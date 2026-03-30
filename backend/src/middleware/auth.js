'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_NAME = 'werkdocs_session';

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'not authenticated' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired session' });
  }
}

function requireSiteAccess(db) {
  return async (req, res, next) => {
    const { siteId } = req.params;
    if (!siteId) return next();

    try {
      const result = await db.query(
        `SELECT id FROM sites WHERE id = $1 AND org_id = $2`,
        [siteId, req.user.orgId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'site not found' });
      }
      next();
    } catch (err) {
      console.error('[requireSiteAccess]', err);
      res.status(500).json({ error: 'server error' });
    }
  };
}

const ROLE_LEVELS = { viewer: 0, member: 1, admin: 2, owner: 3 };

function requireRole(minRole) {
  return (req, res, next) => {
    const userLevel = ROLE_LEVELS[req.user?.role] ?? -1;
    const minLevel  = ROLE_LEVELS[minRole] ?? 0;
    if (userLevel >= minLevel) return next();
    return res.status(403).json({ error: 'insufficient permissions' });
  };
}

function signToken(payload) {
  return jwt.sign(
    {
      ...payload,
      impersonator_id: null,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Set COOKIE_SECURE=true only when serving over HTTPS.
    // Leaving it unset (default) allows HTTP deployments to work.
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

module.exports = {
  requireAuth,
  requireSiteAccess,
  requireRole,
  signToken,
  setSessionCookie,
  clearSessionCookie,
};
