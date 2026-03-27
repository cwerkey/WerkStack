-- ─────────────────────────────────────────────────────────────────────────────
-- WerkStack — Migration 001: Initial Schema
-- Organizations, Users, Memberships, Sites with Row-Level Security
--
-- Conventions:
--   • All PKs are UUID via gen_random_uuid()
--   • All timestamps are TIMESTAMPTZ (stored UTC, returned as ISO 8601)
--   • RLS enabled on every table; SET app.current_org_id per transaction
--   • DB owner role bypasses RLS by default (FORCE ROW LEVEL SECURITY can be
--     enabled when a restricted app role is provisioned in production)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: safe org context reader ──────────────────────────────────────────
-- Returns NULL (not an error) when app.current_org_id is unset.
-- Used by all RLS policies so auth endpoints (no org context) pass through.

CREATE OR REPLACE FUNCTION current_org_id()
  RETURNS UUID LANGUAGE sql STABLE AS
$$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid
$$;

-- ── Organizations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Visible when: org matches current context, OR no context set (auth endpoints)
CREATE POLICY orgs_tenant ON organizations
  USING (id = current_org_id() OR current_org_id() IS NULL);

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL UNIQUE,
  username      TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_org_id_idx ON users (org_id);
CREATE INDEX IF NOT EXISTS users_email_idx  ON users (email);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_tenant ON users
  USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- ── Memberships ───────────────────────────────────────────────────────────────
-- Tracks cross-organization access grants (future multi-org invite system).
-- In v1 every user has a single primary org via users.org_id. This table is
-- reserved for the Phase 10+ invite flow; populated but not actively queried.

CREATE TABLE IF NOT EXISTS memberships (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member'
                         CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS memberships_org_id_idx  ON memberships (org_id);
CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON memberships (user_id);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant ON memberships
  USING (org_id = current_org_id() OR current_org_id() IS NULL);

-- ── Sites ─────────────────────────────────────────────────────────────────────
-- Included in migration 001 because GET /api/auth/me hydrates the sites list.
-- Full sites CRUD routes are added in Phase 4.

CREATE TABLE IF NOT EXISTS sites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  location    TEXT        NOT NULL DEFAULT '',
  color       TEXT        NOT NULL DEFAULT '#c47c5a',
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sites_org_id_idx ON sites (org_id);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY sites_tenant ON sites
  USING (org_id = current_org_id() OR current_org_id() IS NULL);
