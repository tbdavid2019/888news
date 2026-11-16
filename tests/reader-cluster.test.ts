import assert from "node:assert/strict";
import http from "node:http";
import { after, beforeEach, describe, it } from "node:test";
import { config } from "@aihot/backend/config";
import {
  DEFAULT_READER_NODES,
  getReaderEndpoints,
  setReaderEndpoints,
  getReaderTimeoutMs,
  getReaderCooldownMs,
  computeReaderJitterDelay,
  applyJitter,
  getNodeState,
  isNodeHealthy,
  markNodeCooldown,
  isNodeLevelFailure,
  parseRetryAfterHeader,
  recordNodeFailure,
  recordNodeSuccess,
  resetReaderCluster,
  selectCandidateNodes,
  getReaderClusterStatus,
  parseReaderText,
  readPageAsMarkdown,
  readPageAsHtml,
} from "@aihot/backend/providers/reader";

describe("Reader Cluster Node Configuration", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    resetReaderCluster();
    delete process.env.READER_BASE_URLS;
    delete process.env.READER_ENDPOINTS;
    delete process.env.READER_BASE_URL;
    delete process.env.JINA_BASE_URL;
    delete process.env.READER_TIMEOUT_MS;
    delete process.env.READER_COOLDOWN_MS;
  });

  after(() => {
    process.env = origEnv;
    resetReaderCluster();
  });

  it("defaults to three specified cluster nodes", () => {
    assert.deepEqual(DEFAULT_READER_NODES, [
      "https://2md.aiurl.tw",
      "https://create360.ai",
      "https://2md.glsoft.ai",
    ]);
    const endpoints = getReaderEndpoints();
    assert.deepEqual(endpoints, [
      "https://2md.aiurl.tw",
      "https://create360.ai",
      "https://2md.glsoft.ai",
    ]);
  });

  it("parses comma-separated endpoints from READER_BASE_URLS", () => {
    process.env.READER_BASE_URLS = "https://node1.example.com/ , https://node2.example.com///";
    const endpoints = getReaderEndpoints();
    assert.deepEqual(endpoints, [
      "https://node1.example.com",
      "https://node2.example.com",
    ]);
  });

  it("parses READER_ENDPOINTS when READER_BASE_URLS is unset", () => {
    process.env.READER_ENDPOINTS = "https://endpoint-a.com,https://endpoint-b.com";
    const endpoints = getReaderEndpoints();
    assert.deepEqual(endpoints, [
      "https://endpoint-a.com",
      "https://endpoint-b.com",
    ]);
  });

  it("supports programmatic endpoint override with setReaderEndpoints", () => {
    setReaderEndpoints(["https://custom1.com/", "https://custom2.com"]);
    assert.deepEqual(getReaderEndpoints(), ["https://custom1.com", "https://custom2.com"]);
    setReaderEndpoints(null);
    assert.deepEqual(getReaderEndpoints(), [
      "https://2md.aiurl.tw",
      "https://create360.ai",
      "https://2md.glsoft.ai",
    ]);
  });

  it("uses generous 45s default timeout and respects READER_TIMEOUT_MS", () => {
    assert.equal(getReaderTimeoutMs(), 45_000);
    process.env.READER_TIMEOUT_MS = "60000";
    assert.equal(getReaderTimeoutMs(), 60_000);
    process.env.READER_TIMEOUT_MS = "invalid";
    assert.equal(getReaderTimeoutMs(), 45_000);
  });

  it("uses 60s default cooldown and respects READER_COOLDOWN_MS", () => {
    assert.equal(getReaderCooldownMs(), 60_000);
    process.env.READER_COOLDOWN_MS = "30000";
    assert.equal(getReaderCooldownMs(), 30_000);
  });
});

describe("Anti-Thundering Herd Jitter", () => {
  it("computes randomized jitter delay between 100ms and 400ms", () => {
    for (let i = 0; i < 50; i++) {
      const delay = computeReaderJitterDelay(100, 400);
      assert.ok(delay >= 100 && delay <= 400, `Delay ${delay} out of range [100, 400]`);
    }
  });

  it("skips jitter in test mode or for local stubs", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "test";
      const start = Date.now();
      const delay = await applyJitter("https://example.com/page");
      assert.equal(delay, 0);
      assert.ok(Date.now() - start < 50);

      // Skips for local loopback urls even if NODE_ENV is not test
      delete process.env.NODE_ENV;
      const localDelay = await applyJitter("http://127.0.0.1:3000/page");
      assert.equal(localDelay, 0);

      // With explicit skipJitter
      const skipped = await applyJitter("https://example.com/page", { skipJitter: true });
      assert.equal(skipped, 0);

      // When forceJitter is passed, delay is executed and returned
      const forced = await applyJitter("https://example.com/page", { forceJitter: true, minMs: 10, maxMs: 30 });
      assert.ok(forced >= 10 && forced <= 30);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });
});

describe("Round-Robin Load Balancing and Circuit Breaker", () => {
  beforeEach(() => {
    resetReaderCluster();
    setReaderEndpoints(["https://node-a.com", "https://node-b.com", "https://node-c.com"]);
  });

  after(() => {
    resetReaderCluster();
  });

  it("distributes requests via round-robin across healthy nodes", () => {
    const round1 = selectCandidateNodes();
    assert.equal(round1[0], "https://node-a.com");

    const round2 = selectCandidateNodes();
    assert.equal(round2[0], "https://node-b.com");

    const round3 = selectCandidateNodes();
    assert.equal(round3[0], "https://node-c.com");

    const round4 = selectCandidateNodes();
    assert.equal(round4[0], "https://node-a.com");
  });

  it("trips circuit breaker into cooldown on node failure and excludes cooled nodes from candidate rotation", () => {
    const nodeA = "https://node-a.com";
    assert.equal(isNodeHealthy(nodeA), true);

    recordNodeFailure(nodeA, new Error("HTTP 502 Bad Gateway"), 502);
    assert.equal(isNodeHealthy(nodeA), false);

    const state = getNodeState(nodeA);
    assert.equal(state.consecutiveFailures, 1);
    assert.ok(state.cooldownUntil > Date.now());

    // When selecting candidate nodes, only healthy nodes (B and C) are returned to prevent traffic leakage
    const candidates = selectCandidateNodes();
    // Round-robin counter starts at node B
    assert.equal(candidates[0], "https://node-b.com");
    assert.equal(candidates[1], "https://node-c.com");
    // Node A is strictly excluded
    assert.equal(candidates.length, 2);
    assert.ok(!candidates.includes("https://node-a.com"));
  });

  it("does not trip circuit breaker on target page client errors (404/403)", () => {
    const nodeB = "https://node-b.com";
    assert.equal(isNodeHealthy(nodeB), true);

    // Target article not found (404)
    recordNodeFailure(nodeB, new Error("HTTP 404 Not Found"), 404);
    assert.equal(isNodeHealthy(nodeB), true, "Node should stay healthy after target 404");
    assert.equal(getNodeState(nodeB).consecutiveFailures, 0);

    // Target article forbidden (403)
    recordNodeFailure(nodeB, new Error("HTTP 403 Forbidden"), 403);
    assert.equal(isNodeHealthy(nodeB), true, "Node should stay healthy after target 403");
  });

  it("classifies node-level vs target-level errors correctly", () => {
    assert.equal(isNodeLevelFailure(new Error("connect ECONNREFUSED 127.0.0.1:80")), true);
    assert.equal(isNodeLevelFailure(new Error("Request timed out"), 504), true);
    assert.equal(isNodeLevelFailure(new Error("Too many requests"), 429), true);
    assert.equal(isNodeLevelFailure(new Error("Internal Server Error"), 500), true);
    assert.equal(isNodeLevelFailure(new Error("Not found on target"), 404), false);
    assert.equal(isNodeLevelFailure(new Error("Forbidden target"), 403), false);
    assert.equal(isNodeLevelFailure(new Error("Bad request target"), 400), false);
  });

  it("parses Retry-After headers in seconds or HTTP-Date format and caps at 300s", () => {
    const resSec = { headers: new Headers({ "retry-after": "120" }) };
    assert.equal(parseRetryAfterHeader(resSec), 120);

    const resUnbounded = { headers: new Headers({ "retry-after": "99999" }) };
    assert.equal(parseRetryAfterHeader(resUnbounded), 300, "Capped at 5 minutes");

    const futureDate = new Date(Date.now() + 60_000).toUTCString();
    const resDate = { headers: new Headers({ "retry-after": futureDate }) };
    const parsedSec = parseRetryAfterHeader(resDate);
    assert.ok(parsedSec && parsedSec >= 50 && parsedSec <= 65);
  });

  it("supports dynamic Retry-After cooldown", () => {
    const nodeB = "https://node-b.com";
    const now = Date.now();
    recordNodeFailure(nodeB, { message: "Rate limit", retryAfterSeconds: 120 }, 429, now);
    const state = getNodeState(nodeB);
    assert.equal(state.cooldownUntil, now + 120_000);
  });

  it("recovers node state upon successful response", () => {
    const nodeA = "https://node-a.com";
    markNodeCooldown(nodeA, 60_000);
    assert.equal(isNodeHealthy(nodeA), false);

    recordNodeSuccess(nodeA);
    assert.equal(isNodeHealthy(nodeA), true);
    assert.equal(getNodeState(nodeA).consecutiveFailures, 0);
    assert.equal(getNodeState(nodeA).cooldownUntil, 0);
  });

  it("reports cluster status correctly", () => {
    markNodeCooldown("https://node-a.com", 60_000);
    const status = getReaderClusterStatus();
    assert.equal(status.length, 3);
    assert.equal(status[0]!.url, "https://node-a.com");
    assert.equal(status[0]!.isHealthy, false);
    assert.ok(status[0]!.cooldownRemainingMs > 0);
    assert.equal(status[1]!.url, "https://node-b.com");
    assert.equal(status[1]!.isHealthy, true);
  });
});

describe("Reader Text Parsing", () => {
  it("parses 2md header block with title, url, published time and markdown", () => {
    const raw = [
      "Title: Exciting AI Breakthrough",
      "URL Source: https://example.org/ai-news",
      "Published Time: 2026-11-16T08:00:00Z",
      "Markdown Content:",
      "# Exciting AI Breakthrough",
      "",
      "Researchers unveiled a revolutionary architecture today.",
    ].join("\n");

    const page = parseReaderText(raw, "https://example.org/ai-news");
    assert.equal(page.title, "Exciting AI Breakthrough");
    assert.equal(page.url, "https://example.org/ai-news");
    assert.equal(page.publishedTime, "2026-11-16T08:00:00Z");
    assert.match(page.markdown, /# Exciting AI Breakthrough/);
    assert.match(page.markdown, /Researchers unveiled a revolutionary architecture/);
  });

  it("extracts title from Markdown H1 if header block is absent", () => {
    const raw = [
      "# Simple Markdown Title",
      "",
      "Paragraph 1 text content without header tags.",
    ].join("\n");

    const page = parseReaderText(raw);
    assert.equal(page.title, "Simple Markdown Title");
    assert.equal(page.markdown, raw.trim());
  });
});

describe("Failover and Recovery with Live HTTP Mock Servers", () => {
  let serverA: http.Server;
  let serverB: http.Server;
  let serverC: http.Server;
  let portA: number;
  let portB: number;
  let portC: number;
  const previousPrivateFetch = config.allowPrivateNetworkFetch;

  after(async () => {
    config.allowPrivateNetworkFetch = previousPrivateFetch;
    await Promise.all([
      new Promise<void>((r) => serverA?.close(() => r())),
      new Promise<void>((r) => serverB?.close(() => r())),
      new Promise<void>((r) => serverC?.close(() => r())),
    ]);
    resetReaderCluster();
  });

  it("sets up mock servers and performs automatic failover when Node A fails", async () => {
    config.allowPrivateNetworkFetch = true;

    let serverACalls = 0;
    let serverBCalls = 0;
    let serverCCalls = 0;

    // Server A: Always returns 502 Bad Gateway
    serverA = http.createServer((_req, res) => {
      serverACalls++;
      res.statusCode = 502;
      res.end("Bad Gateway from Node A");
    });
    await new Promise<void>((r) => serverA.listen(0, "127.0.0.1", r));
    portA = (serverA.address() as { port: number }).port;

    // Server B: Returns valid markdown
    serverB = http.createServer((req, res) => {
      serverBCalls++;
      if (req.headers["x-respond-with"] === "html") {
        res.setHeader("content-type", "text/html");
        res.end("<article><h1>Hello from Server B HTML</h1><p>Body</p></article>");
        return;
      }
      res.setHeader("content-type", "text/plain");
      res.end(
        "Title: Success from Node B\nURL Source: https://example.com/target\n\nMarkdown Content:\n# Success\nContent from Node B",
      );
    });
    await new Promise<void>((r) => serverB.listen(0, "127.0.0.1", r));
    portB = (serverB.address() as { port: number }).port;

    // Server C: Healthy standby
    serverC = http.createServer((_req, res) => {
      serverCCalls++;
      res.setHeader("content-type", "text/plain");
      res.end("Title: Node C Standby\n\nMarkdown Content:\n# Standby");
    });
    await new Promise<void>((r) => serverC.listen(0, "127.0.0.1", r));
    portC = (serverC.address() as { port: number }).port;

    // Configure cluster with [NodeA, NodeB, NodeC]
    resetReaderCluster();
    const nodeA = `http://127.0.0.1:${portA}`;
    const nodeB = `http://127.0.0.1:${portB}`;
    const nodeC = `http://127.0.0.1:${portC}`;
    setReaderEndpoints([nodeA, nodeB, nodeC]);

    // Request 1: Node A should fail (502), automatically failover to Node B and succeed
    const page = await readPageAsMarkdown("https://example.com/target", { skipJitter: true });
    assert.equal(page.title, "Success from Node B");
    assert.match(page.markdown, /Content from Node B/);
    assert.equal(serverACalls, 1, "Node A was tried first");
    assert.equal(serverBCalls, 1, "Node B was tried on failover");
    assert.equal(serverCCalls, 0, "Node C was not needed");

    // Verify Node A was tripped into cooldown, while Node B is healthy
    assert.equal(isNodeHealthy(nodeA), false);
    assert.equal(isNodeHealthy(nodeB), true);

    // Request 2: Next request should skip Node A and route between Node B and Node C
    serverACalls = 0;
    serverBCalls = 0;
    serverCCalls = 0;

    const page2 = await readPageAsMarkdown("https://example.com/target-2", { skipJitter: true });
    // Round robin over healthy nodes [B, C]
    assert.equal(serverACalls, 0, "Node A was skipped because it is in cooldown");
    assert.ok(serverBCalls === 1 || serverCCalls === 1, "One of the healthy nodes handled the request");
  });

  it("performs HTML read with failover", async () => {
    const nodeA = `http://127.0.0.1:${portA}`;
    const nodeB = `http://127.0.0.1:${portB}`;
    setReaderEndpoints([nodeA, nodeB]);

    // Node A is in cooldown from previous test, so Node B is selected
    const html = await readPageAsHtml("https://example.com/target-html", { skipJitter: true });
    assert.match(html, /Hello from Server B HTML/);
  });

  it("throws clear aggregated error when all nodes fail", async () => {
    // Both Node1 and Node2 return 500
    const failServer = http.createServer((_req, res) => {
      res.statusCode = 500;
      res.end("Internal error");
    });
    await new Promise<void>((r) => failServer.listen(0, "127.0.0.1", r));
    const failPort = (failServer.address() as { port: number }).port;

    resetReaderCluster();
    const badNode1 = `http://127.0.0.1:${failPort}`;
    const badNode2 = `http://127.0.0.1:${portA}`; // Also returns 502
    setReaderEndpoints([badNode1, badNode2]);

    await assert.rejects(
      async () => {
        await readPageAsMarkdown("https://example.com/fail-test", { skipJitter: true });
      },
      (err: Error) => {
        assert.match(err.message, /\[ReaderCluster\] All reader nodes failed/);
        return true;
      },
    );

    // Now both nodes are cooling down. Subsequent request should reject immediately without network delay
    const start = Date.now();
    await assert.rejects(
      async () => {
        await readPageAsMarkdown("https://example.com/fail-fast-test", { skipJitter: true });
      },
      (err: Error) => {
        assert.match(err.message, /\[ReaderCluster\] All reader nodes are cooling down/);
        return true;
      },
    );
    assert.ok(Date.now() - start < 1000, "Rejected immediately when all nodes are in cooldown");

    await new Promise<void>((r) => failServer.close(() => r()));
  });
});

describe("RSS Body Extraction and Teaser Threshold Optimization", () => {
  let rssServer: http.Server;
  let rssPort: number;
  const previousPrivateFetch = config.allowPrivateNetworkFetch;

  const shortBody = "<p>" + "Short teaser text summary. ".repeat(15) + "</p>"; // ~400 chars (< 800)
  const longBody = "<p>" + "Substantial editorial analysis article content. ".repeat(25) + "</p>"; // ~1200 chars (> 800)

  after(async () => {
    config.allowPrivateNetworkFetch = previousPrivateFetch;
    await new Promise<void>((r) => rssServer?.close(() => r()));
  });

  it("marks editorial sources as pending when body length < 800 chars", async () => {
    config.allowPrivateNetworkFetch = true;

    rssServer = http.createServer((_req, res) => {
      res.setHeader("content-type", "application/atom+xml");
      res.end(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Short Article</title>
    <link href="https://example.org/short" />
    <updated>2026-11-16T00:00:00Z</updated>
    <content type="html"><![CDATA[${shortBody}]]></content>
  </entry>
  <entry>
    <title>Long Article</title>
    <link href="https://example.org/long" />
    <updated>2026-11-16T00:00:00Z</updated>
    <content type="html"><![CDATA[${longBody}]]></content>
  </entry>
</feed>`);
    });
    await new Promise<void>((r) => rssServer.listen(0, "127.0.0.1", r));
    rssPort = (rssServer.address() as { port: number }).port;

    const { fetchRss } = await import("@aihot/backend/sources/rss");
    const feedUrl = `http://127.0.0.1:${rssPort}/atom.xml`;

    // 1. Editorial source: short body (< 800 chars) -> pending, long body -> ok
    const resEditorial = await fetchRss({
      id: "editorial-test",
      config: { feedUrl },
      participation_mode: "editorial",
    } as any, { force: true });

    assert.equal(resEditorial.candidates.length, 2);
    const [shortCand, longCand] = resEditorial.candidates;
    assert.equal(shortCand!.bodyStatus, "pending");
    assert.equal(shortCand!.bodyHtml, null);
    assert.equal(shortCand!.bodyText, null);
    assert.ok(shortCand!.excerpt && shortCand!.excerpt.length > 50, "Keeps excerpt from short body");

    assert.equal(longCand!.bodyStatus, "ok");
    assert.ok(longCand!.bodyText && longCand!.bodyText.length >= 800);

    // 2. Non-editorial source (e.g. hot_signal): > 280 chars is ok
    const resSignal = await fetchRss({
      id: "signal-test",
      config: { feedUrl },
      participation_mode: "hot_signal",
    } as any, { force: true });
    assert.equal(resSignal.candidates[0]!.bodyStatus, "ok");

    // 3. alwaysExtractBody === true forces pending even on long articles
    const resAlwaysExtract = await fetchRss({
      id: "always-extract-test",
      config: { feedUrl, alwaysExtractBody: true },
      participation_mode: "editorial",
    } as any, { force: true });
    assert.equal(resAlwaysExtract.candidates[1]!.bodyStatus, "pending");

    // 4. Verify alwaysExtractBody is registered in config-keys.ts
    const { unsupportedConfig } = await import("@aihot/backend/sources/config-keys");
    const unsupported = unsupportedConfig("rss", { feedUrl, alwaysExtractBody: true });
    assert.deepEqual(unsupported, [], "alwaysExtractBody should be a recognized RSS config key");
  });
});

describe("Content Extraction with Reader Cluster Fallback", () => {
  let webServer: http.Server;
  let readerMock: http.Server;
  let webPort: number;
  let readerPort: number;
  const previousPrivateFetch = config.allowPrivateNetworkFetch;

  after(async () => {
    config.allowPrivateNetworkFetch = previousPrivateFetch;
    await Promise.all([
      new Promise<void>((r) => webServer?.close(() => r())),
      new Promise<void>((r) => readerMock?.close(() => r())),
    ]);
    resetReaderCluster();
  });

  it("falls back to Reader cluster when local readability yields < 800 chars", async () => {
    config.allowPrivateNetworkFetch = true;

    // Web server serving a thin/teaser article (~300 chars)
    webServer = http.createServer((_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!DOCTYPE html>
<html>
  <head><title>Teaser Article</title></head>
  <body>
    <article>
      <h1>Short Teaser Article</h1>
      <p>This is a short preview text. Please subscribe or enable JavaScript to read the complete article on our platform. ${"Preview snippet content. ".repeat(6)}</p>
    </article>
  </body>
</html>`);
    });
    await new Promise<void>((r) => webServer.listen(0, "127.0.0.1", r));
    webPort = (webServer.address() as { port: number }).port;

    // Mock Reader server returning full markdown (~1200 chars)
    const fullMarkdownText = "A full, deep-dive research article rendered via headless browser. ".repeat(20);
    readerMock = http.createServer((_req, res) => {
      res.setHeader("content-type", "text/plain");
      res.end(`Title: Full Article via Reader\nURL Source: http://127.0.0.1:${webPort}/article\n\nMarkdown Content:\n# Full Article via Reader\n\n${fullMarkdownText}`);
    });
    await new Promise<void>((r) => readerMock.listen(0, "127.0.0.1", r));
    readerPort = (readerMock.address() as { port: number }).port;

    resetReaderCluster();
    setReaderEndpoints([`http://127.0.0.1:${readerPort}`]);

    const { extractFromUrl } = await import("@aihot/backend/content/extract");
    const targetUrl = `http://127.0.0.1:${webPort}/article`;

    // 1. With allowJina: true -> local HTML is < 800 chars, so it uses Reader cluster
    const extracted = await extractFromUrl(targetUrl, { allowJina: true, subject: "test" });
    assert.ok(extracted, "Extraction succeeded");
    assert.equal(extracted.via, "jina");
    assert.ok(extracted.text.length > 800);
    assert.match(extracted.text, /rendered via headless browser/);

    // 2. With allowJina: false -> local HTML is returned directly without Reader
    const localOnly = await extractFromUrl(targetUrl, { allowJina: false, subject: "test" });
    assert.ok(localOnly, "Local extraction succeeded");
    assert.equal(localOnly.via, "readability");
    assert.ok(localOnly.text.length < 800);
  });
});


