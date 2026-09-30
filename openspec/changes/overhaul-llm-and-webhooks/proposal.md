# Proposal: Overhaul LLM Providers with Anti-Thundering-Herd Fallback, Universal Webhooks, and 2md Dynamic Scraper

## Why

The current AIHOT upstream framework is tightly coupled to domestic Chinese services and has critical reliability gaps:
1. LLM presets focus heavily on domestic Chinese models. Global users and modern tech stacks require direct first-class support for **Groq, Google Gemini, OpenAI**, and flexible **custom OpenAI-compatible endpoints**.
2. LLMs frequently encounter rate limits (429), regional outages, or provider downtime. A naive fallback chain triggers a dangerous **Thundering Herd Problem (驚群效應)**: when the primary LLM goes down, dozens of concurrent worker jobs fail simultaneously and stampede onto `fallback_1`, instantly exhausting its rate limits and cascading down to knock out `fallback_2`. We need an intelligent fallback mechanism with **Circuit Breakers, Canary Probing, Jittered Backoff, and Concurrency Limits**, coupled with proactive admin notifications.
3. Operations alerts, feedback forwarding, and briefing deliveries are coupled exclusively to **Feishu (飛書)**. Teams predominantly use **Slack, Discord, and Telegram**. We need a clean, multi-channel webhook notification system.
4. Dynamic anti-scraping for web pages currently defaults to paid Jina Reader. We need native support for **`2md.aiurl.tw` (888-url2md)** to convert dynamic anti-scraping web pages, articles, and documents into clean Markdown for LLMs with zero paid token overhead.

## What Changes

- **Global LLM Provider Support**:
  - Add native presets and credentials for **Groq** (`groq`), **Google Gemini** (via OpenAI-compatible endpoint or native SDK), and **OpenAI** (`openai`), alongside arbitrary custom OpenAI-compatible baseURL/API keys.
- **Anti-Thundering-Herd Multi-Tier Fallback & Admin Notification**:
  - Implement a 3-tier execution pipeline: `Primary Model -> Fallback 1 -> Fallback 2`.
  - **Circuit Breaker per Provider**: When a provider trips (repeated failures or HTTP 429), the circuit transitions to `OPEN` for a cooldown duration. New incoming requests skip the tripped provider immediately rather than hammering it.
  - **Canary Probing (HALF-OPEN)**: Upon cooldown expiry, only a single canary request probes the provider. Other requests continue to use fallback until the primary is verified healthy.
  - **Full Jitter & Concurrency Limiting**: Stagger fallback retries with randomized backoff and cap max in-flight requests per fallback tier to prevent stampeding.
  - **Admin Alerting**: Automatically trigger an **Operations Alert** to notify administrators when any fallback tier is activated, including the failing provider, error code, and fallback model used.
- **Universal Multi-Channel Webhooks (Slack, Discord, Telegram)**:
  - Implement outbound webhook formatters and senders for **Slack** (Incoming Webhooks / Block Kit), **Discord** (Webhooks / Embeds), and **Telegram** (Bot API `sendMessage`).
  - Route **Operational Alerts** (worker stalls, collection failures, LLM fallback events) to Slack/Discord/Telegram.
  - Route **User Feedback** submissions directly to Slack/Discord/Telegram.
  - Support **Selected Stories & Daily Briefings** push notifications to Slack/Discord/Telegram channels.
- **Dynamic Scraper via 2md.aiurl.tw**:
  - Support configuring `READER_BASE_URL` (defaulting to `https://2md.aiurl.tw`) for web pages requiring dynamic JavaScript rendering and anti-scraping bypass, parsing clean Markdown without token fees.

## Capabilities

### New Capabilities
- `llm-provider-fallback`: Multi-provider LLM support (Groq, Gemini, OpenAI, custom endpoints), anti-thundering-herd fallback execution chain (`fallback 1`, `fallback 2` with Circuit Breaker, Canary Probing, and Jitter), and real-time admin alerting.
- `multi-channel-webhooks`: Universal webhook dispatching engine supporting Slack, Discord, and Telegram for alerts, user feedback, and daily/selected briefings.
- `dynamic-scraper-reader`: Support `https://2md.aiurl.tw` (`888-url2md`) as the primary dynamic rendering and reader engine for anti-scraping pages.

### Modified Capabilities
<!-- None: No existing specs exist in the repository -->

## Impact

- **Backend**:
  - `packages/backend/src/providers/llm.ts`: Restructure model registry, add Groq/Gemini/OpenAI presets, and wrap calls with Circuit Breaker and fallback chain.
  - `packages/backend/src/providers/jina.ts`: Generalize into `reader.ts` supporting `READER_BASE_URL` pointing to `https://2md.aiurl.tw` with clean markdown extraction.
  - `packages/backend/src/notify/`: Introduce channel-agnostic notification dispatchers (`slack.ts`, `discord.ts`, `telegram.ts`), decoupling alert/feedback/content delivery from Feishu.
  - `packages/backend/src/operations/alerts.ts` & `feedback.ts`: Route notifications through the new multi-channel dispatcher.
- **Environment & Configuration**:
  - Add `.env` parameters for `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `LLM_FALLBACK_1_*`, `LLM_FALLBACK_2_*`.
  - Add `.env` parameters for `READER_BASE_URL` (default `https://2md.aiurl.tw`).
  - Add `.env` parameters for `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- **Backward Compatibility**:
  - Existing `LLM_BASE_URL` and `LLM_API_KEY` configurations remain 100% compatible as default primary provider.
  - Existing Feishu configurations remain supported as an optional legacy channel.
