import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPodcastChannels, loadPodcastRecommend, loadPodcastTickers } from "@aihot/backend/publication/podcast";
import { bridgePodcastsToPublications } from "@aihot/backend/publication/podcast-bridge";
import { associateEntitiesAndTickers, syncBigGoPodcastEpisodes, syncPodcastFeeds } from "@aihot/backend/sources/podcast-sync";

test("publication layer exports loadPodcastChannels, loadPodcastRecommend, and loadPodcastTickers functions", () => {
  assert.equal(typeof loadPodcastChannels, "function");
  assert.equal(typeof loadPodcastRecommend, "function");
  assert.equal(typeof loadPodcastTickers, "function");
  assert.equal(typeof bridgePodcastsToPublications, "function");
  assert.equal(typeof syncPodcastFeeds, "function");
  assert.equal(typeof syncBigGoPodcastEpisodes, "function");
  assert.equal(typeof associateEntitiesAndTickers, "function");
});
