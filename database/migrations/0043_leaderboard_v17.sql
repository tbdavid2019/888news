-- Leaderboard method v17: calibrations table, cleanup of obsolete rankings columns, and model name normalization.

CREATE TABLE IF NOT EXISTS lb_calibrations (
  methodology_version text NOT NULL,
  unit text NOT NULL,
  protocol text NOT NULL,
  calibration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (methodology_version, unit, protocol)
);

ALTER TABLE lb_rankings
  DROP COLUMN IF EXISTS uncertainty,
  DROP COLUMN IF EXISTS confidence,
  DROP COLUMN IF EXISTS metric_count,
  DROP COLUMN IF EXISTS summary,
  DROP COLUMN IF EXISTS component_scores;

UPDATE lb_models AS m SET name = v.name, updated_at = now()
FROM (VALUES
  ('qwen-3-4-b', 'Qwen3-4B'),
  ('qwen-3-14-b', 'Qwen3-14B'),
  ('qwen-3-32-b', 'Qwen3-32B'),
  ('qwen-3-5-27-b', 'Qwen3.5-27B'),
  ('qwen-3-6-27-b', 'Qwen3.6-27B'),
  ('qwen-3-8-27-b', 'Qwen3.8-27B'),
  ('qwen-3-235-b-a-22-b-2507', 'Qwen3-235B-A22B-2507'),
  ('mimo-v-2-5', 'MiMo-V2.5'),
  ('mimo-v-2-5-pro', 'MiMo-V2.5-Pro'),
  ('mimo-v-2-6-pro', 'MiMo-V2.6-Pro'),
  ('minimax-m-3', 'MiniMax-M3'),
  ('gemma-4-31-b-it', 'Gemma 4 31B'),
  ('gpt-oss-120-b', 'gpt-oss-120b'),
  ('gpt-oss-20-b', 'gpt-oss-20b'),
  ('nemotron-3-ultra-550-b-a-55-b', 'Nemotron 3 Ultra')
) AS v(slug, name)
WHERE m.slug = v.slug AND m.name <> v.name;

UPDATE lb_models AS m SET provider_slug = v.provider_slug, updated_at = now()
FROM (VALUES
  ('claude-sonnet-5-5', 'anthropic'),
  ('gpt-6-1-sol', 'openai'),
  ('command-a-plus-05-2026', 'cohere')
) AS v(slug, provider_slug)
WHERE m.slug = v.slug AND m.provider_slug = 'other';
