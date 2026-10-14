import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPodcastChannels, loadPodcastRecommend } from "@aihot/backend/publication/podcast";

test("publication layer exports loadPodcastChannels and loadPodcastRecommend functions", () => {
  assert.equal(typeof loadPodcastChannels, "function");
  assert.equal(typeof loadPodcastRecommend, "function");
});
