import test from "node:test";
import assert from "node:assert/strict";
import {
  sendSlackAlert,
  sendSlackFeedback,
  isSlackConfigured,
} from "@aihot/backend/notify/slack";
import {
  sendDiscordAlert,
  sendDiscordFeedback,
  isDiscordConfigured,
} from "@aihot/backend/notify/discord";
import {
  sendTelegramAlert,
  sendTelegramFeedback,
  isTelegramConfigured,
} from "@aihot/backend/notify/telegram";
import { dispatchAlert, dispatchFeedback } from "@aihot/backend/notify/dispatch";

test("webhook configuration detection", () => {
  // Without env vars set, should report false
  const oldSlack = process.env.SLACK_WEBHOOK_URL;
  const oldDiscord = process.env.DISCORD_WEBHOOK_URL;
  const oldTgToken = process.env.TELEGRAM_BOT_TOKEN;
  const oldTgChat = process.env.TELEGRAM_CHAT_ID;

  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;

  assert.equal(isSlackConfigured(), false);
  assert.equal(isDiscordConfigured(), false);
  assert.equal(isTelegramConfigured(), false);

  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
  process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
  process.env.TELEGRAM_BOT_TOKEN = "123456:ABC-DEF";
  process.env.TELEGRAM_CHAT_ID = "-100123456";

  assert.equal(isSlackConfigured(), true);
  assert.equal(isDiscordConfigured(), true);
  assert.equal(isTelegramConfigured(), true);

  // Restore
  if (oldSlack) process.env.SLACK_WEBHOOK_URL = oldSlack;
  else delete process.env.SLACK_WEBHOOK_URL;
  if (oldDiscord) process.env.DISCORD_WEBHOOK_URL = oldDiscord;
  else delete process.env.DISCORD_WEBHOOK_URL;
  if (oldTgToken) process.env.TELEGRAM_BOT_TOKEN = oldTgToken;
  else delete process.env.TELEGRAM_BOT_TOKEN;
  if (oldTgChat) process.env.TELEGRAM_CHAT_ID = oldTgChat;
  else delete process.env.TELEGRAM_CHAT_ID;
});

test("dispatchAlert runs without error when no channels configured", async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;

  const res = await dispatchAlert("Test Alert", ["Line 1", "Line 2"], "now");
  assert.deepEqual(res.dispatchedChannels, []);
});

test("dispatchFeedback runs without error when no channels configured", async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;

  const res = await dispatchFeedback({
    id: 99,
    content: "Great site!",
    email: "test@example.com",
    pageUrl: "https://888news.com",
    createdAt: new Date(),
  });
  assert.deepEqual(res.dispatchedChannels, []);
});
