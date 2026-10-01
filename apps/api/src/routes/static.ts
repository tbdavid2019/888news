// Discovery and static files: sitemap, llms.txt, robots, security.txt, the web manifest, the OpenAPI
// document, icons, the IndexNow key, leaderboard logos and the about page's contact codes.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SITE } from "@aihot/industry/site";
import { FEATURES } from "@aihot/industry/features";
import { CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { REPO_ROOT, config } from "@aihot/backend/config";
import { applyPublicHeaders, sendTextWithEtag } from "../http/respond.ts";
import { sitemapXml } from "@aihot/backend/publication/sitemap";
import { llmsTxt, loadLlmsAvailability } from "@aihot/backend/publication/llms";

const REF = path.join(REPO_ROOT, "reference");
const ASSETS = path.join(REPO_ROOT, "assets");
const BRAND = path.join(REPO_ROOT, "industry/brand");

const TYPES: Record<string, string> = {
  ".json": "application/json; charset=UTF-8",
  ".txt": "text/plain; charset=UTF-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const fileCache = new Map<string, { body: Buffer; etag: string; mtime: number }>();

async function loadFile(file: string) {
  const s = await stat(file);
  const cached = fileCache.get(file);
  if (cached && cached.mtime === s.mtimeMs) return cached;
  const body = await readFile(file);
  const entry = { body, etag: `W/"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`, mtime: s.mtimeMs };
  fileCache.set(file, entry);
  return entry;
}

async function sendFile(req: FastifyRequest, reply: FastifyReply, file: string, opts: { type?: string; cacheControl: string }) {
  let entry;
  try {
    entry = await loadFile(file);
  } catch {
    return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
  }
  reply.header("Content-Type", opts.type ?? TYPES[path.extname(file)] ?? "application/octet-stream");
  reply.header("Cache-Control", opts.cacheControl);
  reply.header("ETag", entry.etag);
  if (req.headers["if-none-match"] === entry.etag) return reply.code(304).send();
  return reply.send(entry.body);
}

function robotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /api/v1/",
    "Allow: /api/mcp",
    "Disallow: /api/",
    "Disallow: /admin/",
    "Disallow: /starred",
    "Disallow: /feedback",
    "",
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

function manifest() {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.description,
    lang: SITE.locale,
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#13191c",
    theme_color: "#13191c",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

const SW_SCRIPT = `const CACHE_NAME = '888news-v1';
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32x32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((match) => match || caches.match('/')))
    );
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/build/') ||
    /\\.(woff2?|ttf|png|svg|ico|jpg|jpeg|webp)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    );
    return;
  }
});
`;

/** The OpenAPI document with this deployment's name, address and categories. */
let openApi: string | null = null;
async function openApiJson(): Promise<string> {
  if (openApi) return openApi;
  const raw = (await readFile(path.join(REF, "public-v1.openapi.json"), "utf8"))
    .replaceAll("{{siteName}}", SITE.name)
    .replaceAll("{{siteUrl}}", config.siteUrl)
    .replaceAll("{{categoryList}}", CATEGORY_KEYS.join(", "));
  const doc = JSON.parse(raw) as { paths: Record<string, unknown>; components?: { parameters?: Record<string, { schema?: { enum?: string[] } }> } };
  // Categories follow the industry pack.
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    for (const key of ["enum", "examples"]) if (Array.isArray(o[key]) && (o[key] as unknown[]).includes("{{categories}}")) o[key] = [...CATEGORY_KEYS];
    for (const v of Object.values(o)) walk(v);
  };
  walk(doc);
  if (!FEATURES.codexResetMonitor) for (const p of Object.keys(doc.paths)) if (p.startsWith("/api/v1/codex-resets")) delete doc.paths[p];
  openApi = JSON.stringify(doc, null, 2);
  return openApi;
}

export function registerStatic(app: FastifyInstance) {
  app.get("/sitemap.xml", async (req, reply) => {
    try {
      const xml = await sitemapXml();
      return sendTextWithEtag(req, reply, xml, { etagPrefix: "sitemap", cacheControl: "public, max-age=0, s-maxage=300, must-revalidate", contentType: "application/xml" });
    } catch (error) {
      req.log.error({ err: error }, "sitemap unavailable");
      return reply.code(503).header("Retry-After", "300").header("Cache-Control", "no-store").send("Sitemap temporarily unavailable");
    }
  });

  app.get("/llms.txt", async (req, reply) => {
    const text = llmsTxt(await loadLlmsAvailability());
    applyPublicHeaders(reply, { cors: false });
    return sendTextWithEtag(req, reply, text, { etagPrefix: "llms", cacheControl: "public, s-maxage=3600, stale-while-revalidate=86400", contentType: "text/plain; charset=utf-8" });
  });

  app.get("/robots.txt", (req, reply) => sendTextWithEtag(req, reply, robotsTxt(), { etagPrefix: "robots", cacheControl: "public, max-age=3600", contentType: "text/plain; charset=utf-8" }));

  app.get("/.well-known/security.txt", (req, reply) => {
    if (!SITE.contactEmail) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
    const expires = new Date(Date.now() + 180 * 86400_000).toISOString();
    const text = `Contact: mailto:${SITE.contactEmail}\nExpires: ${expires}\nPreferred-Languages: zh, en\nCanonical: ${config.siteUrl}/.well-known/security.txt\n`;
    return sendTextWithEtag(req, reply, text, { etagPrefix: "security", cacheControl: "public, max-age=86400", contentType: "text/plain; charset=utf-8" });
  });

  app.get("/manifest.webmanifest", (req, reply) =>
    sendTextWithEtag(req, reply, JSON.stringify(manifest()), { etagPrefix: "manifest", cacheControl: "public, max-age=86400", contentType: "application/manifest+json" }));

  app.get("/sw.js", (req, reply) => {
    reply.header("Service-Worker-Allowed", "/");
    return sendTextWithEtag(req, reply, SW_SCRIPT, {
      etagPrefix: "sw",
      cacheControl: "public, max-age=0, must-revalidate",
      contentType: "application/javascript; charset=utf-8",
    });
  });

  app.get("/openapi-v1.json", async (req, reply) => {
    applyPublicHeaders(reply);
    return sendTextWithEtag(req, reply, await openApiJson(), { etagPrefix: "openapi", cacheControl: "public, max-age=300, stale-while-revalidate=3600", contentType: "application/json; charset=utf-8" });
  });

  // IndexNow proves the key by a file at the site root named after it (INDEXNOW_KEY).
  if (config.indexNowKey) {
    app.get(`/${config.indexNowKey}.txt`, (req, reply) => sendTextWithEtag(req, reply, config.indexNowKey!, { etagPrefix: "indexnow", cacheControl: "public, max-age=3600", contentType: "text/plain; charset=utf-8" }));
  }

  // Icons from the industry pack (industry/brand/).
  for (const icon of [
    "favicon.ico",
    "favicon.svg",
    "favicon-32x32.png",
    "favicon-16x16.png",
    "icon.png",
    "icon-192.png",
    "icon-512.png",
    "apple-icon.png",
    "apple-touch-icon.png",
    "logo.svg",
  ]) {
    app.get(`/${icon}`, (req, reply) => sendFile(req, reply, path.join(BRAND, icon), { cacheControl: "public, max-age=86400, stale-while-revalidate=604800" }));
  }

  if (FEATURES.leaderboard) {
    for (const dir of ["model-providers", "leaderboard-sources"]) {
      app.get(`/${dir}/:file`, (req, reply) => {
        const file = (req.params as { file: string }).file;
        if (!/^[a-z0-9-]+\.(svg|png)$/.test(file)) return reply.code(404).send();
        return sendFile(req, reply, path.join(ASSETS, dir, file), { cacheControl: "public, max-age=604800" });
      });
    }
  }

  // Contact codes on the about page: uploaded in the admin (content-hashed names), or shipped in the pack.
  app.get("/contact/:file", async (req, reply) => {
    const file = (req.params as { file: string }).file;
    if (!/^[\w.-]+\.(png|jpg|jpeg|webp)$/.test(file)) return reply.code(404).send();
    const hashed = /-[0-9a-f]{8}\./.test(file);
    const cacheControl = hashed ? "public, max-age=31536000, immutable" : "public, max-age=3600";
    const uploaded = path.join(config.dataDir, "uploads", file);
    const target = (await stat(uploaded).then(() => true, () => false)) ? uploaded : path.join(BRAND, "contact", file);
    return sendFile(req, reply, target, { cacheControl });
  });
}
