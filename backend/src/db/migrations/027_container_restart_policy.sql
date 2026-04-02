-- Add restart_policy column to containers
ALTER TABLE containers
  ADD COLUMN restart_policy TEXT NOT NULL DEFAULT 'no'
  CHECK (restart_policy IN ('no', 'always', 'on-failure', 'unless-stopped'));
