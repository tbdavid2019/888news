-- 0040_podcasts.sql: Podcast channels, episodes, ticker linkages, and market quotes cache.

CREATE TABLE IF NOT EXISTS podcasts (
  id                   text PRIMARY KEY,
  slug                 text NOT NULL UNIQUE,
  title                text NOT NULL,
  author               text,
  description          text,
  feed_url             text,
  site_url             text,
  youtube_channel_id   text,
  cover_url            text,
  tier                 text NOT NULL DEFAULT 'T1' CHECK (tier IN ('T1', 'T2', 'T3')),
  category             text NOT NULL DEFAULT 'ai-tech',
  tags                 text[] NOT NULL DEFAULT '{}',
  episode_count        integer NOT NULL DEFAULT 0,
  follower_count_claim text DEFAULT '100K+',
  enabled              boolean NOT NULL DEFAULT true,
  last_fetch_at        timestamptz,
  last_ok_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS podcasts_enabled_idx ON podcasts (enabled);

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id                  text PRIMARY KEY,
  podcast_id          text NOT NULL REFERENCES podcasts (id) ON DELETE CASCADE,
  guid                text NOT NULL,
  url                 text NOT NULL,
  title               text NOT NULL,
  title_zh            text,
  published_at        timestamptz NOT NULL,
  discovered_at       timestamptz NOT NULL DEFAULT now(),
  audio_url           text NOT NULL,
  audio_duration_sec  integer,
  audio_duration_str  text,
  hosts               text[] NOT NULL DEFAULT '{}',
  guests              text[] NOT NULL DEFAULT '{}',
  language            text NOT NULL DEFAULT 'EN',
  summary_zh          text,
  key_points          text[] NOT NULL DEFAULT '{}',
  cover_url           text,
  youtube_url         text,
  spotify_url         text,
  apple_url           text,
  score               numeric(5, 2),
  clef_label          text DEFAULT 'PASS',
  selected            boolean NOT NULL DEFAULT true,
  search_text         text NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT podcast_episodes_guid_unique UNIQUE (podcast_id, guid)
);

CREATE INDEX IF NOT EXISTS podcast_episodes_published_idx ON podcast_episodes (published_at DESC);
CREATE INDEX IF NOT EXISTS podcast_episodes_podcast_idx ON podcast_episodes (podcast_id, published_at DESC);
CREATE INDEX IF NOT EXISTS podcast_episodes_selected_idx ON podcast_episodes (selected, published_at DESC);

CREATE TABLE IF NOT EXISTS podcast_episode_tickers (
  episode_id          text NOT NULL REFERENCES podcast_episodes (id) ON DELETE CASCADE,
  ticker              text NOT NULL,
  entity_id           text NOT NULL,
  mention_context     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (episode_id, ticker)
);

CREATE INDEX IF NOT EXISTS podcast_tickers_ticker_idx ON podcast_episode_tickers (ticker);
CREATE INDEX IF NOT EXISTS podcast_tickers_entity_idx ON podcast_episode_tickers (entity_id);

CREATE TABLE IF NOT EXISTS market_quotes (
  ticker              text PRIMARY KEY,
  name                text NOT NULL,
  exchange            text NOT NULL,
  price               numeric(12, 4) NOT NULL,
  change_amount       numeric(12, 4) NOT NULL,
  change_percent      numeric(8, 4) NOT NULL,
  currency            text NOT NULL DEFAULT 'USD',
  market_time         timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
