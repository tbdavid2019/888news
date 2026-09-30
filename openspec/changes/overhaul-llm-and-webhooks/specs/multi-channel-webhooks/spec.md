# Spec Delta: multi-channel-webhooks

## Purpose

Dispatches system operational alerts, user feedback submissions, and curated daily/selected news briefings to popular modern collaboration platforms including Slack, Discord, and Telegram.

## ADDED Requirements

### Requirement: Slack Webhook Integration
The system SHALL support sending operational alerts, user feedback submissions, and curated article cards to Slack channels via incoming webhook URLs.

#### Scenario: Dispatch alert to Slack
- **WHEN** an operational alert or LLM fallback event occurs and `SLACK_WEBHOOK_URL` is configured
- **THEN** the system SHALL post a formatted Slack message with colored side-borders and structured field blocks indicating level, impact, and action.

#### Scenario: Dispatch user feedback to Slack
- **WHEN** a user submits feedback and `SLACK_FEEDBACK_WEBHOOK_URL` (or `SLACK_WEBHOOK_URL`) is configured
- **THEN** the system SHALL post a message to Slack containing user comments, source page URL, sender email, and screenshot attachment link if provided.

### Requirement: Discord Webhook Integration
The system SHALL support sending notifications and news briefings to Discord channels via Discord Webhook URLs.

#### Scenario: Dispatch alert to Discord
- **WHEN** an operational alert occurs and `DISCORD_WEBHOOK_URL` is configured
- **THEN** the system SHALL post a rich Discord embed with appropriate severity color (red for critical, yellow for warning), title, description, and timestamp.

#### Scenario: Dispatch selected articles to Discord
- **WHEN** a new article is selected and `DISCORD_CONTENT_WEBHOOK_URL` is enabled
- **THEN** the system SHALL post an embed card with the headline, summary, key reasons, source attribution, and article URL.

### Requirement: Telegram Bot Integration
The system SHALL support sending notifications to Telegram chats or channels using the Telegram Bot API (`sendMessage`).

#### Scenario: Dispatch alert to Telegram
- **WHEN** an operational alert occurs and `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured
- **THEN** the system SHALL deliver a MarkdownV2 or HTML formatted message to the specified Telegram chat ID.

#### Scenario: Dispatch feedback to Telegram
- **WHEN** user feedback is received and `TELEGRAM_FEEDBACK_CHAT_ID` (or `TELEGRAM_CHAT_ID`) is configured
- **THEN** the system SHALL forward the feedback text, sender details, and page link to the Telegram chat.

### Requirement: Unified Multi-Channel Dispatcher
The system SHALL provide a unified notification interface that distributes alerts and messages concurrently to all configured and enabled communication channels (Slack, Discord, Telegram, and optional Feishu) without letting one failing channel block or delay others.

#### Scenario: Multi-channel fan-out
- **WHEN** an alert is triggered with Slack, Discord, and Telegram all configured
- **THEN** the system SHALL dispatch the notification to all three platforms in parallel and log individual delivery outcomes.
