# Spec Delta: llm-provider-fallback

## Purpose

Provides a robust multi-tier LLM execution engine supporting global AI providers (Groq, Gemini, OpenAI, custom OpenAI-compatible endpoints) with anti-thundering-herd fallback protection (Circuit Breaker, Canary Probing, Jittered Backoff) and real-time administrator alerting.

## ADDED Requirements

### Requirement: Global LLM Providers Support
The system SHALL support configuring and executing requests against OpenAI, Groq, Google Gemini (OpenAI-compatible endpoint), and arbitrary custom OpenAI-compatible endpoints via environment variables and model presets.

#### Scenario: Groq model execution
- **WHEN** the primary model is configured with a Groq model (e.g., `llama-3.3-70b-versatile` with `GROQ_API_KEY`)
- **THEN** the system SHALL authenticate and send chat completions to the Groq API endpoint and return valid structured responses.

#### Scenario: Gemini model execution
- **WHEN** the primary model is configured with Google Gemini (e.g., `gemini-2.5-flash` with `GEMINI_API_KEY`)
- **THEN** the system SHALL authenticate and communicate via the Gemini OpenAI-compatible endpoint and parse structured outputs successfully.

#### Scenario: Custom OpenAI-compatible endpoint
- **WHEN** custom `LLM_BASE_URL` and `LLM_API_KEY` are provided
- **THEN** the system SHALL direct requests to the specified endpoint adhering to standard OpenAI chat completion schemas.

### Requirement: Anti-Thundering-Herd Fallback Execution Chain
The system SHALL support configuring a primary model and up to two fallback models (`fallback_1` and `fallback_2`). To prevent a cascading stampede (Thundering Herd Problem) onto fallback models, the system SHALL enforce Circuit Breaker tracking, Canary Probing, and randomized Jittered Backoff across all tiers.

#### Scenario: Circuit breaker trip on rate limit or outage
- **WHEN** a provider fails with HTTP 429 or repeated 5xx errors exceeding the threshold
- **THEN** the circuit for that provider SHALL trip to `OPEN` for a cooldown period, causing subsequent tasks to route directly to the active fallback without hammering the broken provider.

#### Scenario: Canary probing on half-open
- **WHEN** the cooldown period expires on a tripped primary provider
- **THEN** the system SHALL allow only a single canary request to probe the primary while other concurrent tasks continue on the fallback tier until the primary is verified healthy.

#### Scenario: Jittered backoff and concurrency limit on fallback
- **WHEN** multiple concurrent worker jobs transition to a fallback tier
- **THEN** the system SHALL apply randomized delay jitter and throttle concurrent in-flight requests to prevent overloading the fallback model's rate limit.

#### Scenario: Exhaustion of all fallback tiers
- **WHEN** the primary model, `fallback_1`, and `fallback_2` all fail
- **THEN** the system SHALL record the chained failure history and mark the task failed for scheduled retry.

### Requirement: Real-Time Admin Alerting on Fallback Activation
The system SHALL immediately generate an operational alert whenever a request fails on a primary or intermediate model and switches to a fallback model. The alert SHALL include the failed provider, HTTP status code or error reason, the fallback model being engaged, and the capability/purpose of the call.

#### Scenario: Alert dispatched on fallback switch
- **WHEN** an article processing task fails on the primary provider and switches to `fallback_1`
- **THEN** the system SHALL create an operational alert finding and dispatch an immediate high-priority alert notification to configured admin notification channels.
