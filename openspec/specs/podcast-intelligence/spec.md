# podcast-intelligence Specification

## Purpose
Extracts structured insights from podcast episodes using AI models and connects mentioned entities with real-time financial market quotes.

## Requirements

### Requirement: Structured episode intelligence extraction
The system SHALL process episode text context with an AI model prompt to extract hosts, guests, a 100-200 word summary, key takeaway pills, and commercial entity mentions.

#### Scenario: Episode with hosts and distinguished guests
- **WHEN** episode text mentions interviews with specific guests and institutions
- **THEN** the model output populates `hosts` and `guests` arrays with names and affiliations, a concise `summaryZh` TL;DR, and 3 to 5 `keyPoints` pills

#### Scenario: Episode with single host and no guest
- **WHEN** a solo episode is analyzed without external interviewees
- **THEN** the model output lists the solo host, leaves `guests` empty, and generates the core takeaway summary and argument tags

### Requirement: Financial entity normalization and ticker association
The system SHALL cross-reference mentioned entities against the project taxonomy and associate matching public stock tickers and exchanges with the episode record.

#### Scenario: Recognized public company mentioned
- **WHEN** an episode discusses recognized public companies such as Alphabet, NVIDIA, or Meituan
- **THEN** the system normalizes the mentions to canonical entity IDs and links corresponding tickers (e.g. `GOOGL`, `NVDA`, `3690.HK`) in `podcast_episode_tickers`

#### Scenario: Private entity or general concept mentioned
- **WHEN** an episode discusses private startups or broad technologies without a public listing
- **THEN** the system links the canonical entity without creating a stock ticker association

### Requirement: Cached market quote enrichment
The system SHALL maintain a background-updated market quotes cache and serve ticker prices and daily percentage changes without external API calls during reader page views.

#### Scenario: Active market quote available
- **WHEN** reader requests episode recommendations referencing public tickers
- **THEN** the publication reading layer merges the latest price and daily percent change from the `market_quotes` cache into the response payload

#### Scenario: Market quote unavailable or outdated
- **WHEN** a ticker quote is not yet fetched or the remote quote service times out
- **THEN** the system returns the ticker symbol without price change, omitting the percentage badge while keeping the episode payload intact
