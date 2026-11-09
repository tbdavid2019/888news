-- Daily quota tracking for default AI companion usage (6 questions/day per IP or device fingerprint)
CREATE TABLE IF NOT EXISTS ask_daily_usage (
  identifier VARCHAR(256) NOT NULL,
  day_date VARCHAR(10) NOT NULL,
  count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identifier, day_date)
);

CREATE INDEX IF NOT EXISTS ask_daily_usage_day_idx ON ask_daily_usage(day_date);
