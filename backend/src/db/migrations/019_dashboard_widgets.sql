-- 019_dashboard_widgets.sql — Per-user dashboard widget layout persistence

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  site_id    UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  widget_key TEXT        NOT NULL,
  x          INT         NOT NULL DEFAULT 0,
  y          INT         NOT NULL DEFAULT 0,
  w          INT         NOT NULL DEFAULT 6,
  h          INT         NOT NULL DEFAULT 4,
  visible    BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE(user_id, site_id, widget_key)
);

CREATE INDEX IF NOT EXISTS dashboard_widgets_user_site_idx ON dashboard_widgets (user_id, site_id);
