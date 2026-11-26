-- Multi-platform reset monitor (Codex, Antigravity, Claude, Grok Bot).
ALTER TABLE monitor_posts
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'codex';

ALTER TABLE monitor_events
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'codex';

CREATE INDEX IF NOT EXISTS monitor_posts_platform_time_idx
  ON monitor_posts (platform, published_at DESC);

CREATE INDEX IF NOT EXISTS monitor_events_platform_updated_idx
  ON monitor_events (platform, updated_at DESC);
