import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePodcastFeedXml } from "@aihot/backend/sources/podcast-rss";

const MOCK_PODCAST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>All-In with Chamath, Jason, Sacks &amp; Friedberg</title>
    <link>https://allinpodcast.co</link>
    <description>Four besties discuss business, tech, politics and poker.</description>
    <itunes:author>The Besties</itunes:author>
    <itunes:image href="https://example.com/allin-cover.jpg"/>
    <item>
      <title>E175: AI Bubble vs Utility, Jensen Huang Computex Keynote</title>
      <guid isPermaLink="false">allin-e175-jensen</guid>
      <link>https://allinpodcast.co/e175</link>
      <pubDate>Mon, 10 Jun 2024 14:00:00 GMT</pubDate>
      <itunes:duration>01:25:30</itunes:duration>
      <itunes:author>Chamath, Jason, Sacks, Friedberg</itunes:author>
      <itunes:image href="https://example.com/e175.jpg"/>
      <enclosure url="https://example.com/e175.mp3" type="audio/mpeg" length="12345678"/>
      <description><![CDATA[The besties break down Jensen Huang's keynote at Computex and Nvidia's roadmap.]]></description>
      <content:encoded><![CDATA[<p>Full breakdown of Computex, AI datacenter economics, and TSMC foundry dominance.</p>]]></content:encoded>
      <podcast:transcript url="https://example.com/e175.vtt" type="text/vtt"/>
    </item>
  </channel>
</rss>`;

test("parsePodcastFeedXml parses channel and episode metadata accurately without downloading audio", () => {
  const feed = parsePodcastFeedXml(MOCK_PODCAST_XML);

  assert.equal(feed.title, "All-In with Chamath, Jason, Sacks & Friedberg");
  assert.equal(feed.author, "The Besties");
  assert.equal(feed.coverUrl, "https://example.com/allin-cover.jpg");
  assert.equal(feed.episodes.length, 1);

  const ep = feed.episodes[0];
  assert.equal(ep.guid, "allin-e175-jensen");
  assert.equal(ep.title, "E175: AI Bubble vs Utility, Jensen Huang Computex Keynote");
  assert.equal(ep.link, "https://allinpodcast.co/e175");
  assert.equal(ep.audioUrl, "https://example.com/e175.mp3");
  assert.equal(ep.audioDurationSec, 5130); // 1h 25m 30s
  assert.equal(ep.audioDurationStr, "01:25:30");
  assert.equal(ep.coverUrl, "https://example.com/e175.jpg");
  assert.equal(ep.transcriptUrl, "https://example.com/e175.vtt");
  assert.match(ep.showNotes, /Full breakdown of Computex/);
});
