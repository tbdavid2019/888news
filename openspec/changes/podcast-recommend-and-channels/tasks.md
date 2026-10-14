# Tasks

## 1. Database Schema & Seed Data

- [x] 1.1 Create incremental migration `database/migrations/0040_podcasts.sql` defining `podcasts`, `podcast_episodes`, `podcast_episode_tickers`, and `market_quotes` tables and verify SQL syntax against existing migrations
- [x] 1.2 Add seed configuration `industry/podcasts.json` and seed script `scripts/seed-podcasts.ts` covering all 100 BigGo finance podcast channels with metadata, covers, and subscriber metrics, verifying JSON validation

## 2. Zero-Disk Podcast Ingestion & Poller

- [x] 2.1 Implement `packages/backend/src/sources/podcast-rss.ts` parsing RSS feed XML, iTunes metadata (`itunes:author`, `itunes:duration`, `itunes:image`), enclosures, and Podcasting 2.0 `<podcast:transcript>` tags without writing audio files to local disk, verified with mock XML unit tests
- [x] 2.2 Wire scheduled podcast feed polling in `apps/worker/src/schedules.ts` for recurring synchronization and verify TypeScript type check passes

## 3. AI Episode Intelligence & Market Quotes

- [x] 3.1 Create editorial prompt `industry/prompts/podcast-understand.md` extracting hosts, guests, 100-200 word summary, topic pills, and canonical entity mentions, verified with markdown structure and schema check
- [x] 3.2 Update `industry/taxonomy.ts` to enrich the `ENTITIES` record with public company stock tickers and exchanges (e.g. `GOOGL`, `NVDA`, `3690.HK`, `2330.TW`) and verify typecheck passes
- [x] 3.3 Implement `packages/backend/src/providers/market.ts` for cached Yahoo Finance ticker quotes and background refresh schedule, verified with unit test
- [x] 3.4 Integrate CLEF / JEV decision engine evaluation in `packages/backend/src/editorial/podcast.ts` for podcast episode relevance prefiltering (`PASS`/`BLOCK`) and attention scoring (`0-100`), verified with decision engine mock test

## 4. Publication Reading Layer & API Routes

- [x] 4.1 Implement `packages/backend/src/publication/podcast.ts` exposing `loadPodcastRecommend`, `loadPodcastChannels`, and `loadPodcastTickers` with ETag support, verified with publication unit test
- [x] 4.2 Expose `/api/site/podcast/*` endpoints in `apps/api/src/routes/podcast.ts` and register with Fastify server, verifying endpoint responses against contract

## 5. Impeccable Web Experience & Audio Player

- [x] 5.1 Implement local-first anonymous channel follow (`aihot-followed-podcasts`) and starring (`aihot-starred-episodes`) in `apps/web/app/lib/local-state.ts`, verified with local-state helper tests
- [x] 5.2 Build horizontal entity filter ribbon with smooth scroll snap in `apps/web/app/components/podcast-entity-ribbon.tsx`, verified with component render test
- [x] 5.3 Build 3-column responsive episode card component with host/guest roster, AI summary, topic pills, and directional stock ticker badges (`apps/web/app/components/podcast-episode-card.tsx`)
- [x] 5.4 Build channel card component with follower metrics and optimistic follow toggle in `apps/web/app/components/podcast-channel-card.tsx`
- [x] 5.5 Implement persistent floating bottom audio player bar (`apps/web/app/components/podcast-player-bar.tsx`) with 15s skip and progress slider
- [x] 5.6 Register `/podcast/recommend`, `/podcast/channels`, and `/podcast/channels/:slug` in `apps/web/app/routes.ts` and build route views, verifying web build succeeds (`npm run build -w @aihot/web`)

## 6. Remote Verification & Acceptance (`news2.david888.com`)

- [x] 6.1 Execute local static typecheck (`npm run typecheck`) ensuring zero local audio file generation and minimal disk footprint
- [ ] 6.2 Push committed changes to Git repository, pull on remote server `news2.david888.com`, run database migration (`0040_podcasts.sql`), and rebuild Docker containers
- [ ] 6.3 Verify live API endpoints and visual UX on `https://news2.david888.com/podcast/recommend` and `/podcast/channels`

## Workflow follow-up

- Archive the change after remote acceptance testing passes on `news2.david888.com`.
- Verify the archived spec documents under `openspec/specs/`.
