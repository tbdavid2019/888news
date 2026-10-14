# Spec Delta

## Purpose

Delivers a responsive, publication-grade web interface for podcast recommendations, channel browsing, entity filtering, anonymous tracking, and audio playback.

## ADDED Requirements

### Requirement: Three-column responsive recommendation feed
The web application SHALL render a responsive 3-column episode grid displaying channel title, external link icon, host and guest list, AI summary, takeaway pills, and ticker badges with price changes.

#### Scenario: Feed rendered on desktop viewport
- **WHEN** a user visits `/podcast/recommend` on a desktop screen
- **THEN** the application renders episode cards in a 3-column grid with structured summary, topic pills, and ticker pills with green/red directional indicators

#### Scenario: Feed rendered on mobile viewport
- **WHEN** a user visits `/podcast/recommend` on a mobile device
- **THEN** the grid collapses gracefully into a single-column stacked layout preserving all card metadata and touch targets

### Requirement: Horizontal entity filter ribbon
The web application SHALL provide a horizontal scrollable ribbon containing recognized entities and company tags that filters the episode list upon selection.

#### Scenario: User selects an entity tag
- **WHEN** a user clicks on an entity pill (e.g. `[NVIDIA]`) in the filter ribbon
- **THEN** the feed immediately filters to episodes discussing NVIDIA and highlights the active tag

#### Scenario: User resets the entity filter
- **WHEN** a user clicks the active entity tag again or selects "All"
- **THEN** the filter resets and the complete episode feed is displayed

### Requirement: Anonymous local-first channel tracking and bookmarking
The web application SHALL allow users to follow channels and bookmark episodes locally in the browser without requiring login or creating a server user account.

#### Scenario: User follows a podcast channel
- **WHEN** a user clicks the "+ Follow" button on a channel card
- **THEN** the channel ID is saved to browser storage via `local-state.ts`, the button transitions to followed state, and the channel appears under the "Followed" tab

#### Scenario: User accesses followed channels tab
- **WHEN** a user navigates to the "Followed Channels" view
- **THEN** the view displays only episodes from channels present in local storage, or a thoughtful empty state if none are followed

### Requirement: Persistent floating audio player
The web application SHALL provide a bottom audio player bar that streams the selected episode audio and persists across client-side page transitions.

#### Scenario: User initiates audio playback
- **WHEN** a user clicks the play button on an episode card
- **THEN** the persistent player bar slides in at the bottom with title, channel, 15-second skip controls, progress slider, and audio playback starts

#### Scenario: User navigates while playing audio
- **WHEN** a user navigates between `/podcast/recommend` and `/podcast/channels` while audio is actively playing
- **THEN** audio playback continues uninterrupted without resetting position or reloading the audio element
