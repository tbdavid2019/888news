# Design

## Context

888news is an industry news intelligence platform built on Node.js/TypeScript (Fastify API, pg-boss worker, React Router v7 web, PostgreSQL database). It follows strict architectural guardrails: public reader requests never trigger external AI model calls or paid APIs, all public data is anonymous and served through a single publication reading layer (`packages/backend/src/publication/`), and database migrations are strictly incremental.

In this change, we integrate a BigGo Finance-inspired podcast intelligence and channel tracking system. A critical operational constraint is the developer's local environment: local disk space is extremely constrained, mandating a strict **Zero-Disk Policy** (no local audio file downloads, no local speech-to-text model checkpoints). Implementation is tested via lightweight local typechecks and verified directly on the remote server `news2.david888.com`.

See `proposal.md` for motivation and `specs/` for normative behavioral requirements.

## Goals / Non-Goals

**Goals:**
- Provide a zero-disk, text-first podcast ingestion pipeline indexing all 100 premier channels from BigGo Finance with RSS enclosures, iTunes metadata, Podcasting 2.0 transcripts, and YouTube captions.
- Structure episode intelligence (hosts, guests, high-density TL;DR, takeaway tags, entity mentions) through a specialized prompt `podcast-understand.md`.
- Associate extracted commercial entities with public company stock tickers and enrich episode cards with background-cached market quotes (`market_quotes`).
- Build an Impeccable web user experience (`apps/web/app`): 3-column responsive card feed (`/podcast/recommend`), channel directory (`/podcast/channels`), horizontal entity filter ribbon, local-first anonymous follow/starring (`local-state.ts`), and a persistent bottom audio player.
- Ensure end-to-end deployment readiness for remote verification on `news2.david888.com`.

**Non-Goals:**
- Heavy local audio transcription: no local Whisper/PyTorch downloads on developer machines.
- Server-side user accounts or login: subscriptions and saved episodes remain local-first in the user's browser, preserving privacy and zero auth overhead.
- Proprietary podcast paywall scraping: only publicly accessible podcast feeds and enclosures are indexed.

## Decisions

### Decision 1: Text-First Ingestion Hierarchy vs. Raw Audio Transcribing
- **Choice**: Implement a 4-tier text extraction hierarchy:
  1. *Tier 1*: Show Notes from `<itunes:summary>` and `<content:encoded>` ($0 cost, 0 disk).
  2. *Tier 2*: Podcasting 2.0 `<podcast:transcript>` tag (<100KB in-memory text stream).
  3. *Tier 3*: YouTube companion channel timed-text captions (<80KB in-memory text stream).
  4. *Tier 4*: For tier-1 flagship episodes without text, stream directly to remote cloud Whisper/Gemini audio API without saving to disk.
- **Rationale**: Top-tier tech/finance podcasts (All-In, Lex Fridman, Lenny's Podcast, 硅谷101) provide rich show notes, timestamps, and transcripts. Text-first satisfies >85% of content intelligence with zero disk storage and instant processing.
- **Alternatives Considered**: Downloading full MP3 audio files and running local Whisper models. Rejected due to extreme disk usage and local resource exhaustion.

### Decision 2: Zero-Disk Policy & Remote Deployment Acceptance
- **Choice**: Keep local developer workflows strictly to TypeScript authoring and `npm run typecheck`. All live ingestion, AI runs, and Docker container tests execute directly on remote target `news2.david888.com`.
- **Rationale**: Directly aligns with user requirement "本機空間很小，不要在本機測試，做完就上遠端去驗收 news2.david888.com".
- **Alternatives Considered**: Running full local PostgreSQL with sample audio dumps. Rejected due to local disk constraints.

### Decision 3: Local-First Anonymous Channel Follow & Star
- **Choice**: Manage user subscriptions (`aihot-followed-podcasts`) and starred episodes (`aihot-starred-episodes`) in the browser using `local-state.ts` (`localStorage` + `useSyncExternalStore`).
- **Rationale**: Consistent with 888news's core principle ("公開內容匿名，管理員和訪客看到的一樣"). Users get instant, optimistic follow/unfollow interactions without needing authentication, backend sessions, or user account tables.
- **Alternatives Considered**: Adding user accounts, JWT authentication, and server-side subscription tables. Rejected as overengineered and privacy-intrusive for an industry intelligence reader.

### Decision 4: Background Market Quotes Cache vs. Live External Quotes Proxy
- **Choice**: Worker cron job periodically queries ticker quotes (via Yahoo Finance API) into `market_quotes` table with a 15-minute TTL during trading hours.
- **Rationale**: Complies with the invariant that page visits never trigger external paid APIs or external network latency. The publication reading layer joins with `market_quotes` in memory or via SQL join, returning instantaneous responses.
- **Alternatives Considered**: Direct client-side fetching or real-time API proxying on each page request. Rejected due to CORS issues, third-party rate limits, and slow page loads.

### Decision 5: Impeccable 3-Column Visual Rhythm and Entity Ribbon
- **Choice**: 3-column responsive card grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) with strict visual hierarchy:
  - Channel branding + external link icon at top.
  - Episode title in high-contrast traditional Chinese / original title typography.
  - Host & Guest attribution with distinctive typography.
  - 100-200 word structured TL;DR.
  - Discussion point pills with subtle contrast.
  - Bottom metadata: time, duration, language tag, and colored ticker pill badges with direction arrows (`↑` / `↓`).
  - Top horizontal entity filter ribbon with CSS scroll snap.
- **Rationale**: Faithfully delivers the BigGo Finance experience with elevated Impeccable frontend craft, avoiding generic AI templates.

## Risks / Trade-offs

- **[Risk: Indie podcast show notes too brief for intelligence extraction]**  
  → *Mitigation*: Fall back to Podcasting 2.0 transcript tags or YouTube caption streams. If all text sources are missing, display the episode with standard metadata and schedule background cloud streaming transcription.
- **[Risk: Hallucinated ticker associations for common words]**  
  → *Mitigation*: Strictly restrict ticker mapping to curated entries in `industry/taxonomy.ts` (`ENTITIES` dictionary). The AI model identifies canonical entity IDs rather than inventing arbitrary ticker symbols.
- **[Risk: Audio playback blocked by cross-origin restrictions]**  
  → *Mitigation*: Set `referrerPolicy="no-referrer"` and `crossOrigin="anonymous"` on the HTML5 `<audio>` element, ensuring direct streaming from podcast CDNs.

## Migration Plan

1. **Database Migration**: Run `0040_podcasts.sql` via `node scripts/migrate.ts` on the remote server to create `podcasts`, `podcast_episodes`, `podcast_episode_tickers`, and `market_quotes`.
2. **Seed Data**: Run `scripts/seed-podcasts.ts` to populate initial seed channels (Lex Fridman, All-In, 硅谷101, Lenny's Podcast, In a Nutshell, etc.).
3. **Deployment**: Push git commit to remote repository, pull on `news2.david888.com`, rebuild Docker containers (`web`, `api`, `worker`), and verify live endpoints.
4. **Rollback Strategy**: Dropping tables introduced in `0040_podcasts.sql` restores the previous database state with zero impact on existing news, leaderboard, or publication tables.
