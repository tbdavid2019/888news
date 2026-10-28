import test from "node:test";
import assert from "node:assert/strict";
import { cleanTweetText, tweetTextToHtml } from "../packages/backend/src/content/sanitize.ts";

test("cleanTweetText removes X signup footers and engagement junk", () => {
  const dirty = `](https://x.com/bot) detects scam emails [@DirtyTesLa](https://x.com/DirtyTesLa) [6h](https://x.com/DirtyTesLa/status/2110037338755657863)  Grok [@bot](https://x.com/bot) can help save you from scam emails. I have public email addresses, and I get daily scams in my inbox. They are getting harder to distinguish from legit emails. I use my Scam Email Detector bot to help alert me to scam emails Try it out: [x.ai/bot/E3_qOY1VUJ…](https://example.invalid/bot/E3_qOY1VUJWZMh2inUvwT)      [333](https://x.com/compose/post?in_reply_to=2110125937551397151) 145 1K 394K

## Log in or sign up for X

See what’s happening and join the conversation

Continue with Apple Continue with Google

 or

[Log in with username or email](https://x.com/i/jf/onboarding/web?mode=login&redirect_after_login=%2Felonmusk)

[Terms](https://x.com/tos)·[Privacy](https://x.com/privacy)·[Cookies](https://support.x.com/articles/20170514)·[Accessibility](https://help.x.com/resources/accessibility)·[Ads Info](https://business.x.com/en/help/troubleshooting/how-twitter-ads-work.html?ref=web-twc-ao-gbl-adsinfo&utm_source=twc&utm_medium=web&utm_campaign=ao&utm_content=adsinfo)·More© 2026 X Corp.`;

  const cleaned = cleanTweetText(dirty);
  assert.ok(!cleaned.includes("Log in or sign up for X"));
  assert.ok(!cleaned.includes("Terms"));
  assert.ok(!cleaned.includes("Privacy"));
  assert.ok(!cleaned.includes("394K"));
  assert.ok(!cleaned.startsWith("]("));
  assert.ok(!cleaned.includes("detects scam emails [@DirtyTesLa]"));
  assert.ok(cleaned.startsWith("Grok"));
  const preservedUrl = [...cleaned.matchAll(/\]\((https?:\/\/[^)]+)\)/g)]
    .map((match) => new URL(match[1]!))
    .find((url) => url.hostname === "example.invalid");
  assert.equal(preservedUrl?.hostname, "example.invalid");
  assert.equal(preservedUrl?.pathname, "/bot/E3_qOY1VUJWZMh2inUvwT");
});

test("tweetTextToHtml converts markdown links and @mentions into HTML", () => {
  const text = "Testing @elonmusk announcement with [Grok AI](https://x.ai/grok) and #AI news.";
  const html = tweetTextToHtml(text);
  assert.ok(html.includes('<a href="https://x.com/elonmusk" target="_blank"'));
  assert.ok(html.includes('<a href="https://x.ai/grok" target="_blank"'));
  assert.ok(html.includes('<a href="https://x.com/hashtag/AI" target="_blank"'));
});
