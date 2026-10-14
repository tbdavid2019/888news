# Proposal

## Why

High-value podcasts (e.g. All-In, Lex Fridman, Lenny's Podcast, 硅谷101, In a Nutshell) produce premier technology, venture, and macroeconomic insights, but audio format poses high time and discovery barriers for busy readers. Drawing inspiration from BigGo Finance's podcast recommendation and channel tracking experience, 888news needs a first-class podcast intelligence hub that extracts structured takeaways, highlights hosts and guests, cross-references mentioned public companies with real-time stock ticker performance, and allows readers to discover and track top shows anonymously.

## What Changes

- **Podcast Channel & Episode Ingestion**: Ingest and index all 100 premier podcast channels from the BigGo Finance catalog (including Founders, Lex Fridman, Bloomberg Businessweek, Latent Space, Joe Rogan, All-In, Lenny's Podcast, 硅谷101, Acquired, Goldman Sachs, etc.). Ingest RSS feeds, metadata, and transcripts under a strict Zero-Disk Policy where raw audio is never stored locally on developer machines.
- **AI Episode Intelligence & Entity Extraction**: Extract host and guest rosters, high-density 100-200 word TL;DR summaries, key takeaway pills, and commercial/tech entity mentions using a unified prompt.
- **Financial Ticker Normalization & Market Quotes**: Map recognized business entities to stock tickers (e.g. Google -> `GOOGL`, NVIDIA -> `NVDA`, 美團 -> `3690.HK`, 台積電 -> `2330.TW`) and enrich episode cards with cached market price changes.
- **Publication Reading Layer**: Expose public, anonymous, ETag-cached endpoints under `/api/site/podcast/*` for episode feeds, channel catalogs, and ticker overviews.
- **Impeccable Web Experience**: Provide a 3-column responsive episode feed (`/podcast/recommend`), channel directory (`/podcast/channels`), horizontal entity filter ribbon (Claude, OpenAI, NVIDIA, Meta, etc.), local-first zero-login channel tracking (`local-state.ts`), and a persistent audio bar.
- **Remote-First Deployment**: Development and verification run lightweight local typechecks, deploying directly to `news2.david888.com` for full end-to-end acceptance.

## Capabilities

### New Capabilities
- `podcast-ingestion`: Ingests and tracks podcast channels and episodes from RSS feeds, Podcasting 2.0 transcripts, and YouTube accompanying captions with zero local audio disk storage.
- `podcast-intelligence`: Provides AI-driven structured extraction (hosts, guests, TL;DR, key discussion pills, commercial entity mentions) and enriches entities with cached stock ticker quotes.
- `podcast-web-experience`: Delivers an Impeccable web UI comprising a 3-column episode feed, channel directory, entity filter ribbon, local-first tracking/bookmarking, and persistent audio playback.

### Modified Capabilities
<!-- None: Existing core news publication and leaderboard capabilities remain backward compatible. -->

## Impact

- **Database**: Adds incremental migration `database/migrations/0040_podcasts.sql` introducing `podcasts`, `podcast_episodes`, `podcast_episode_tickers`, and `market_quotes` tables.
- **Backend & Worker**: Adds `packages/backend/src/sources/podcast-rss.ts`, `packages/backend/src/providers/market.ts`, `packages/backend/src/publication/podcast.ts`, and background cron jobs in `apps/worker/src/schedules.ts`.
- **API**: Adds routes in `apps/api/src/routes/podcast.ts` under `/api/site/podcast/*`.
- **Frontend**: Adds web routes in `apps/web/app/routes.ts` (`/podcast/recommend`, `/podcast/channels`, `/podcast/channels/:slug`), UI components, and state management in `apps/web/app/lib/local-state.ts`.
- **Operational / Environment**: Strictly enforces zero local disk audio storage; acceptance runs on `news2.david888.com`.
