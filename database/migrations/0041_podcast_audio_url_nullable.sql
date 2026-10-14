-- Allow audio_url to be NULL for video/YouTube-first episodes without dedicated audio streams
ALTER TABLE podcast_episodes ALTER COLUMN audio_url DROP NOT NULL;
ALTER TABLE podcast_episodes ALTER COLUMN audio_url SET DEFAULT NULL;
