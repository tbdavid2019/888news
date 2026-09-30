# Tasks: Overhaul LLM Providers, Anti-Thundering-Herd Fallback, Universal Webhooks, and 2md Scraper

## 1. Global LLM Presets & Anti-Thundering-Herd Fallback

- [x] 1.1 Add model presets and credential bindings for Groq, Google Gemini, and OpenAI in `packages/backend/src/providers/llm.ts`, verified via typecheck
- [x] 1.2 Implement the Circuit Breaker state machine (`CLOSED`, `OPEN`, `HALF-OPEN` with single-request Canary probing) per provider in `packages/backend/src/providers/circuit-breaker.ts`, verified by unit tests
- [x] 1.3 Implement the multi-tier fallback execution chain (`primary -> fallback_1 -> fallback_2`) with randomized jittered backoff and in-flight concurrency limiter in `chatJson`, verified by running unit tests simulating primary outage
- [x] 1.4 Implement fallback incident logging and admin alert triggering upon fallback activation, verified by checking generated alert findings
- [x] 1.5 Add comprehensive unit tests for Circuit Breaker and multi-tier fallback behavior in `tests/llm-fallback.test.ts` and verify test suite passes

## 2. Universal Webhook Adapters (Slack, Discord, Telegram)

- [x] 2.1 Implement `packages/backend/src/notify/slack.ts` with Slack Block Kit formatting for alerts, user feedback, and article cards
- [x] 2.2 Implement `packages/backend/src/notify/discord.ts` with Discord Embed formatting for alerts, feedback, and article cards
- [x] 2.3 Implement `packages/backend/src/notify/telegram.ts` utilizing the Telegram Bot API (`sendMessage`)
- [x] 2.4 Implement unified dispatcher `packages/backend/src/notify/dispatch.ts` supporting concurrent multi-channel delivery without cross-channel blocking
- [x] 2.5 Connect operations alerts in `packages/backend/src/operations/alerts.ts` and feedback forwarding in `packages/backend/src/operations/feedback.ts` to `dispatchNotification`
- [x] 2.6 Add unit tests for webhook payload formatters in `tests/webhook-dispatch.test.ts` and verify with mock endpoints

## 3. Dynamic Scraper Integration (2md.aiurl.tw)

- [x] 3.1 Implement universal reader module `packages/backend/src/providers/reader.ts` supporting `READER_BASE_URL` defaulting to `https://2md.aiurl.tw`, verified by unit test parsing
- [x] 3.2 Update web list and detail fetchers in `packages/backend/src/sources/web-list.ts` to utilize the new reader engine for dynamic anti-scraping pages, verified via typecheck

## 4. Configuration, Integration & Verification

- [x] 4.1 Update `scripts/init-env.ts` and `.env.example` to provide prompts and configuration for Groq, Gemini, OpenAI, Fallbacks, 2md Reader, and Slack/Discord/Telegram
- [x] 4.2 Update documentation and `README.md` explaining setup for multi-tier LLMs and Slack/Discord/Telegram integrations
- [x] 4.3 Run `npm run typecheck` and `npm test` across all workspaces to verify zero regressions
