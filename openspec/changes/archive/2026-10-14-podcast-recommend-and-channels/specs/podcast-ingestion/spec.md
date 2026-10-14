# Spec Delta

## Purpose

Provides scheduled ingestion, metadata extraction, transcript synchronization, and episode tracking for podcast feeds with zero local audio disk storage.

## ADDED Requirements

### Requirement: Podcast channel feed ingestion
The system SHALL ingest podcast RSS feeds and extract channel metadata, episode metadata, audio enclosures, and iTunes namespace attributes.

#### Scenario: Successful podcast RSS ingestion
- **WHEN** a valid podcast RSS feed URL is fetched during scheduled polling
- **THEN** the system parses the channel title, description, cover image, episode GUID, publication timestamp, audio enclosure URL, and duration

#### Scenario: Missing optional iTunes metadata
- **WHEN** an episode item lacks `itunes:duration` or `itunes:author` tags
- **THEN** the system records sensible defaults and extracts duration from enclosure byte length or marks it unmeasured without failing the feed ingestion

#### Scenario: Full catalog initialization of all 100 channels
- **WHEN** the system seeds or synchronizes the podcast directory from `industry/podcasts.json`
- **THEN** all 100 podcast channels are populated in the database with their respective covers, follower counts, and channel metadata without duplicate keys

### Requirement: Zero-disk progressive text extraction
The system SHALL extract textual context for each episode using a tiered text-first strategy without saving raw audio files to the local disk.

#### Scenario: Comprehensive show notes available
- **WHEN** an episode contains show notes exceeding minimum length threshold
- **THEN** the system routes the show notes directly to the intelligence pipeline without downloading the audio enclosure

#### Scenario: Podcasting 2.0 transcript available
- **WHEN** an episode contains a `<podcast:transcript>` tag pointing to text or VTT format
- **THEN** the system streams the transcript into memory for processing without writing to local disk

#### Scenario: Developer environment zero-disk enforcement
- **WHEN** ingestion and parsing tasks execute in local development or test mode
- **THEN** no audio files or local transcription model checkpoints are written to the local filesystem

### Requirement: Deduplication and incremental polling
The system SHALL deduplicate podcast episodes by channel identifier and episode GUID, using HTTP conditional headers to minimize bandwidth.

#### Scenario: Feed unchanged via conditional headers
- **WHEN** the server polls a podcast RSS feed with stored ETag or Last-Modified values and receives HTTP 304 Not Modified
- **THEN** the system skips parsing and preserves existing channel and episode records

#### Scenario: Duplicate episode GUID encountered
- **WHEN** a polled feed contains an episode GUID already stored for that channel
- **THEN** the system skips duplicate insertion and updates last seen timestamp only if content is identical
