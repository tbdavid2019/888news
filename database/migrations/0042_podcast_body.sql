-- 0042_podcast_body.sql: Store fulltext body and HTML for podcast episodes
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS body_text text;
ALTER TABLE podcast_episodes ADD COLUMN IF NOT EXISTS body_html text;
