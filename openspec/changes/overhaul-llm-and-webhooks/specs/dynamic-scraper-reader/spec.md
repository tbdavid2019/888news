# Spec Delta: dynamic-scraper-reader

## Purpose

Enables web scraping of dynamic JavaScript-heavy and anti-scraping protected web pages by integrating `https://2md.aiurl.tw` (`888-url2md`) as the primary zero-cost Markdown conversion engine.

## ADDED Requirements

### Requirement: 2md Dynamic Page Scraping & Markdown Extraction
The system SHALL support converting arbitrary target web pages into clean Markdown for LLM processing by dispatching requests to `https://2md.aiurl.tw/<URL>` or via `POST /` with JSON body `{"url": "<URL>"}`.

#### Scenario: Dynamic anti-scraping web page extraction
- **WHEN** a source configured with dynamic rendering needs to be crawled
- **THEN** the system SHALL call the 2md reader service with `Accept: text/plain` (or `Accept: application/json`) and extract clean Markdown content and metadata.

### Requirement: Configurable Reader Base URL
The system SHALL support configuring the reader endpoint via `READER_BASE_URL` in environment variables, defaulting to `https://2md.aiurl.tw`.

#### Scenario: Custom reader endpoint
- **WHEN** `READER_BASE_URL` is configured
- **THEN** the system SHALL route all dynamic rendering requests through the specified endpoint without hardcoding third-party commercial services.
